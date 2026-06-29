# Citelis

Sistema de gestión para un negocio de servicios de belleza: **agendar citas** y conocer la
**ganancia real** por servicio. Multi-tenant desde el día uno (`business_id`).

Ver el plan completo y las invariantes en [PLAN.md](PLAN.md) y [CLAUDE.md](CLAUDE.md).

## Stack

- **React + Vite + TypeScript** (estricto)
- **Vitest** para tests
- Dominio puro sin dependencias de UI en [`src/lib/domain/`](src/lib/domain)
- Despliegue en **Vercel**; tests en la nube vía **GitHub Actions**

## Estado

- ✅ **Slice 0 — dominio puro**: tipos, fórmulas de costo/ganancia, máquina de estados de citas,
  y agregación de reportes. Con tests que cubren cada punto del DoD.
- ⏳ Slice 1 — núcleo de citas (UI en memoria)
- ⏳ Slice 2 — calculadora "por tandas"
- ⏳ Slice 3 — reporte de ganancias
- ⏳ Slice 4 — persistencia Supabase + Auth + RLS

## Scripts

```bash
npm install        # instalar dependencias
npm run dev        # servidor de desarrollo
npm run typecheck  # verificación de tipos
npm run test       # tests en watch
npm run test:run   # tests una vez (lo que corre el CI)
npm run build      # build de producción (lo que despliega Vercel)
```

## Despliegue en Vercel

Vercel autodetecta Vite. Framework Preset: **Vite**, Build Command: `npm run build`,
Output Directory: `dist`. No requiere variables de entorno hasta el Slice 4 (Supabase).
