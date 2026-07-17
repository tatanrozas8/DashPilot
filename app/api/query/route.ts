import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataRow, DatasetProfile } from "@/types/dataset";
import type { AnalyticalDatasetArtifact } from "@/types/analytical-query";
import type { Database } from "@/types/supabase";
import { dataRowSchema, queryServiceRequestSchema, type ExecutedQuerySummary, type QueryServiceRequest } from "@/lib/query-service/contract";
import { GovernedAnalyticalQueryService, InMemoryAnalyticalArtifactRepository } from "@/lib/query-service/service";
import { datasetProfileSchema } from "@/lib/validation/schemas";

interface DatasetVersionProfileRow {
  dataset_id: string;
  profile_json: unknown;
  row_count: number | null;
  column_count: number | null;
}

interface DatasetRowRecord {
  row_json: DataRow;
}

function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return async () => {
    const cookieStore = await cookies();
    return createServerClient<Database>(url, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(items: Array<{ name: string; value: string; options: CookieOptions }>) {
          for (const item of items) cookieStore.set(item.name, item.value, item.options);
        }
      }
    });
  };
}

function querySummary(request: QueryServiceRequest): ExecutedQuerySummary {
  return {
    datasetId: request.datasetId,
    datasetVersionId: request.query.datasetVersionId,
    dashboardId: request.dashboardId,
    kind: request.kind,
    filters: request.query.filters.length,
    limit: request.query.limit,
    offset: request.query.offset
  };
}

function assertDatasetVersionProfileRow(row: unknown): DatasetVersionProfileRow {
  if (typeof row !== "object" || !row) throw new Error("La version del dataset no tiene contrato valido.");
  if (!("dataset_id" in row) || typeof row.dataset_id !== "string") throw new Error("La version del dataset no incluye dataset_id.");
  return {
    dataset_id: row.dataset_id,
    profile_json: "profile_json" in row ? row.profile_json : undefined,
    row_count: "row_count" in row && typeof row.row_count === "number" ? row.row_count : null,
    column_count: "column_count" in row && typeof row.column_count === "number" ? row.column_count : null
  };
}

function assertDatasetRows(rows: unknown[]): DatasetRowRecord[] {
  return rows.map((row) => {
    if (typeof row !== "object" || !row || !("row_json" in row)) {
      throw new Error("Una fila del dataset no tiene contrato valido.");
    }
    return { row_json: dataRowSchema.parse(row.row_json) };
  });
}

async function loadSupabaseArtifact(supabase: SupabaseClient<Database>, request: QueryServiceRequest): Promise<AnalyticalDatasetArtifact> {
  const { data: versionRow, error: versionError } = await supabase
    .from("dataset_versions")
    .select("dataset_id, profile_json, row_count, column_count")
    .eq("id", request.query.datasetVersionId)
    .maybeSingle();
  if (versionError) throw new Error(`No se pudo cargar la version del dataset: ${versionError.message}`);
  if (!versionRow) throw new Error("No existe la version del dataset consultada.");
  const version = assertDatasetVersionProfileRow(versionRow);
  if (version.dataset_id !== request.datasetId) throw new Error("La version consultada no pertenece al dataset solicitado.");
  const parsedProfile = datasetProfileSchema.safeParse(version.profile_json);
  if (!parsedProfile.success) throw new Error("El perfil del dataset no coincide con el contrato esperado.");

  const { data: rowData, error: rowError } = await supabase
    .from("dataset_rows")
    .select("row_json")
    .eq("dataset_version_id", request.query.datasetVersionId)
    .order("row_index", { ascending: true });
  if (rowError) throw new Error(`No se pudieron cargar filas para consulta server-side: ${rowError.message}`);
  const rows = assertDatasetRows(rowData ?? []).map((row) => row.row_json);
  const profile: DatasetProfile = {
    ...parsedProfile.data,
    datasetVersionId: request.query.datasetVersionId,
    rowCount: version.row_count ?? parsedProfile.data.rowCount,
    columnCount: version.column_count ?? parsedProfile.data.columnCount
  };
  const fields = profile.columns.map((column) => column.normalizedName);
  return {
    datasetVersionId: request.query.datasetVersionId,
    tenantId: "supabase",
    profile,
    format: "columnar-json",
    path: `supabase://dataset_versions/${request.query.datasetVersionId}`,
    columns: fields.map((name) => ({
      name,
      values: rows.map((row) => row[name] ?? null)
    })),
    rowCount: rows.length,
    columnCount: profile.columnCount
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud de consulta invalida." }, { status: 400 });
  }
  const parsed = queryServiceRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "La consulta no coincide con el contrato gobernado." }, { status: 400 });
  }
  if (parsed.data.context !== "authenticated") {
    return NextResponse.json({ error: "La ruta server-side solo acepta contexto autenticado." }, { status: 400 });
  }
  const factory = createSupabaseServerClient();
  if (!factory) return NextResponse.json({ error: "Supabase no esta configurado." }, { status: 503 });

  try {
    const supabase = await factory();
    const artifact = await loadSupabaseArtifact(supabase, parsed.data);
    const repository = new InMemoryAnalyticalArtifactRepository();
    repository.save(artifact);
    const service = new GovernedAnalyticalQueryService(repository);
    if (parsed.data.kind === "aggregate") {
      const result = await service.execute(parsed.data.query, { tenantId: "supabase", userId: "authenticated-user" });
      return NextResponse.json({
        kind: "aggregate",
        result: {
          ...result,
          columns: Object.keys(result.rows[0] ?? {}),
          errors: [],
          executedQuerySummary: querySummary(parsed.data),
          source: result.metadata.cache === "miss" ? "supabase" : "cache"
        }
      });
    }
    const result = await service.executeTable(parsed.data.query, { tenantId: "supabase", userId: "authenticated-user" });
    return NextResponse.json({
      kind: "table",
      result: {
        ...result,
        columns: parsed.data.query.columns,
        errors: [],
        executedQuerySummary: querySummary(parsed.data),
        source: "supabase"
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo ejecutar la consulta." }, { status: 500 });
  }
}
