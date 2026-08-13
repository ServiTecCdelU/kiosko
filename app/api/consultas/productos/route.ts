// app/api/consultas/productos/route.ts — lecturas del catalogo.
// Conjunto cerrado de acciones: el cliente no elige tablas ni filtros libres.
// Las filas se devuelven crudas y el mapeo a Product sigue en el cliente, para
// no duplicar mapRow.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMITE_MAX = 5000;

function acotar(valor: unknown, porDefecto: number, max = LIMITE_MAX): number {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return porDefecto;
  return Math.min(Math.floor(n), max);
}

/** Quita lo que rompe el filtro .or() de PostgREST. */
function sanitizar(q: string): string {
  return q.replace(/[,()%]/g, " ").trim();
}

function filtrosComunes(q: any, comercioId: string, s: string, categoria?: string) {
  let query = q.eq("comercio_id", comercioId).eq("disabled", false);
  if (s) query = query.or(`name.ilike.%${s}%,codigo.ilike.%${s}%,codigo_barras.ilike.%${s}%`);
  if (categoria) query = query.eq("category", categoria);
  return query;
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const comercioId = String(body?.comercioId ?? "comercio_1");
  const accion = String(body?.accion ?? "");

  switch (accion) {
    case "buscar": {
      const q = sanitizar(String(body?.query ?? ""));
      if (!q) return NextResponse.json({ productos: [] });
      const { data, error } = await supabaseAdmin
        .from("productos")
        .select("*")
        .eq("comercio_id", comercioId)
        .eq("disabled", false)
        .or(`name.ilike.%${q}%,codigo.ilike.%${q}%,codigo_barras.ilike.%${q}%`)
        .order("name", { ascending: true })
        .limit(acotar(body?.limit, 24, 200));
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ productos: data ?? [] });
    }

    case "pagina": {
      const p = body?.params ?? {};
      const s = p.search ? sanitizar(String(p.search)) : "";

      // Stock bajo / agotados: PostgREST no compara dos columnas, se trae un
      // set amplio y se filtra despues.
      if (p.soloStockBajo || p.soloAgotados) {
        let q = filtrosComunes(
          supabaseAdmin.from("productos").select("*"),
          comercioId,
          s,
          p.categoria,
        );
        if (p.soloRevisar) q = q.eq("revisar", true);
        const { data, error } = await q.order("stock", { ascending: true }).limit(1000);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });

        const controlados = (data ?? []).filter((r: any) => r.stock_controlado !== false);
        const filtrados = p.soloAgotados
          ? controlados.filter((r: any) => Number(r.stock) <= 0)
          : controlados.filter((r: any) => Number(r.stock) <= Number(r.stock_minimo));
        return NextResponse.json({ productos: filtrados, total: filtrados.length });
      }

      const page = Math.max(Number(p.page) || 0, 0);
      const size = acotar(p.pageSize, 30, 200);
      let q = filtrosComunes(
        supabaseAdmin.from("productos").select("*", { count: "exact" }),
        comercioId,
        s,
        p.categoria,
      );
      if (p.soloRevisar) q = q.eq("revisar", true);
      const { data, count, error } = await q
        .order("name", { ascending: true })
        .range(page * size, page * size + size - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ productos: data ?? [], total: count ?? 0 });
    }

    case "stats": {
      const { data, error } = await supabaseAdmin
        .from("productos")
        .select("stock, stock_minimo, revisar, stock_controlado")
        .eq("comercio_id", comercioId)
        .eq("disabled", false)
        .limit(5000);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      const rows = data ?? [];
      const controlados = rows.filter((r: any) => r.stock_controlado !== false);
      return NextResponse.json({
        total: rows.length,
        stockBajo: controlados.filter(
          (r: any) => Number(r.stock) > 0 && Number(r.stock) <= Number(r.stock_minimo),
        ).length,
        agotados: controlados.filter((r: any) => Number(r.stock) <= 0).length,
        revisar: rows.filter((r: any) => r.revisar).length,
      });
    }

    case "categorias": {
      const { data, error } = await supabaseAdmin
        .from("productos")
        .select("category")
        .eq("comercio_id", comercioId)
        .eq("disabled", false)
        .not("category", "is", null)
        .neq("category", "")
        .limit(5000);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      const set = new Set((data ?? []).map((r: any) => String(r.category)).filter(Boolean));
      return NextResponse.json({
        categorias: Array.from(set).sort((a, b) => a.localeCompare(b)),
      });
    }

    case "historialPrecio": {
      const productId = String(body?.productId ?? "");
      if (!productId) return NextResponse.json({ error: "Falta el producto" }, { status: 400 });
      const { data, error } = await supabaseAdmin
        .from("producto_auditoria")
        .select("*")
        .eq("comercio_id", comercioId)
        .eq("producto_id", productId)
        .order("fecha", { ascending: false })
        .limit(acotar(body?.limit, 10, 200));
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ cambios: data ?? [] });
    }

    case "catalogo": {
      const { data, error } = await supabaseAdmin
        .from("productos")
        .select("*")
        .eq("comercio_id", comercioId)
        .eq("disabled", false)
        .limit(5000);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ productos: data ?? [] });
    }

    case "favoritos": {
      const { data, error } = await supabaseAdmin
        .from("productos")
        .select("*")
        .eq("comercio_id", comercioId)
        .eq("disabled", false)
        .eq("favorito", true)
        .order("name", { ascending: true })
        .limit(60);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ productos: data ?? [] });
    }

    case "vencimientos": {
      const dias = acotar(body?.dias, 7, 365);
      const limite = new Date();
      limite.setDate(limite.getDate() + dias);
      const { data, error } = await supabaseAdmin
        .from("productos")
        .select("*")
        .eq("comercio_id", comercioId)
        .eq("disabled", false)
        .not("fecha_vencimiento", "is", null)
        .lte("fecha_vencimiento", limite.toISOString().slice(0, 10))
        .order("fecha_vencimiento", { ascending: true })
        .limit(100);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ productos: data ?? [] });
    }

    case "porCodigo": {
      const c = String(body?.code ?? "").trim();
      if (!c) return NextResponse.json({ producto: null });

      const porBarra = await supabaseAdmin
        .from("productos")
        .select("*")
        .eq("comercio_id", comercioId)
        .eq("codigo_barras", c)
        .eq("disabled", false)
        .limit(1)
        .maybeSingle();
      if (porBarra.data) return NextResponse.json({ producto: porBarra.data });

      const porCodigo = await supabaseAdmin
        .from("productos")
        .select("*")
        .eq("comercio_id", comercioId)
        .eq("codigo", c)
        .eq("disabled", false)
        .limit(1)
        .maybeSingle();
      return NextResponse.json({ producto: porCodigo.data ?? null });
    }

    case "mayoresAumentos": {
      const dias = acotar(body?.dias, 30, 365);
      const limit = acotar(body?.limit, 15, 100);
      const desde = new Date();
      desde.setDate(desde.getDate() - dias);

      const { data: cambios, error } = await supabaseAdmin
        .from("producto_auditoria")
        .select("producto_id, valor_anterior, valor_nuevo, usuario_nombre, fecha")
        .eq("comercio_id", comercioId)
        .eq("campo", "price")
        .gte("fecha", desde.toISOString())
        .order("fecha", { ascending: false })
        .limit(500);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      if (!cambios || cambios.length === 0) return NextResponse.json({ aumentos: [] });

      const ids = Array.from(new Set(cambios.map((c: any) => c.producto_id)));
      const { data: productos } = await supabaseAdmin
        .from("productos")
        .select("id, name")
        .eq("comercio_id", comercioId)
        .in("id", ids);
      const nombrePorId = new Map((productos ?? []).map((p: any) => [p.id, p.name]));

      const aumentos = cambios
        .map((c: any) => {
          const anterior = Number(c.valor_anterior) || 0;
          const nuevo = Number(c.valor_nuevo) || 0;
          return {
            productoId: c.producto_id,
            nombre: nombrePorId.get(c.producto_id) ?? c.producto_id,
            precioAnterior: anterior,
            precioNuevo: nuevo,
            variacionPct: anterior > 0 ? ((nuevo - anterior) / anterior) * 100 : 0,
            usuarioNombre: c.usuario_nombre ?? undefined,
            fecha: c.fecha,
          };
        })
        .filter((c) => c.variacionPct > 0)
        .sort((a, b) => b.variacionPct - a.variacionPct)
        .slice(0, limit);

      return NextResponse.json({ aumentos });
    }

    default:
      return NextResponse.json({ error: "Accion desconocida" }, { status: 400 });
  }
}
