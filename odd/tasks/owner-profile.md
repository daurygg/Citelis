# Perfil del dueño o la dueña en el registro

Objetivo: conocer a quien administra cada negocio (nombre, WhatsApp, tipo de negocio) con un registro rápido y profesional.
Rama: `feat/owner-profile` → PR a `develop`, un solo PR con commits por unidad. Tests: vitest (`npm run test:run`), `npm run typecheck`; SQL en CI (`sql-regression`, sin Docker local).

## Specs

- **S1** Al registrarse se piden, obligatorios: "Su nombre, Su whatsapp el tipo de negocio".
- **S2** El registro debe ser "facil y rapido y ameno" y "profesional".
- **S3** A los negocios ya registrados: "pidele los datos la proxima vez que entren." Una sola vez; solo a quien creó el negocio (o, si el negocio es antiguo sin creador conocido, a quien entre).
- **S4** El dueño de la plataforma ve estos datos en el panel de administración.
- **S5** El WhatsApp se valida con la misma regla que el teléfono de clientes (`isValidPhone` / `client_phone_is_valid`).
- **S6** El WhatsApp personal NO es visible para el equipo: tabla propia sin lectura directa, solo vía funciones `security definer`. (Decisión técnica, no pedida explícitamente.)
- **S7** Textos sin género asumido (invariante 4), incluidos los mensajes de error del servidor que aún dicen "empleada"/"clienta".
- **S8** Compatibilidad: el front viejo sigue pudiendo crear negocios contra la base migrada (parámetros nuevos con default); ese negocio queda "pendiente" y cae en S3.

## Tasks

| ID | Specs | Ruta | Estado | Commit |
|---|---|---|---|---|
| T1 | S1, S5 | inline | pendiente | |
| T2 | S1, S3, S4, S5, S6, S8 | inline | pendiente | |
| T3 | S1, S2 | inline | pendiente | |
| T4 | S3 | inline | pendiente | |
| T5 | S4 | inline | pendiente | |
| T6 | S7 | inline | pendiente | |

- T1 dominio: tipos de negocio y validación pura del perfil (+ tests).
- T2 migración: tabla `business_owner_profile`, `create_business` con 3 parámetros opcionales, `owner_profile_pending`, `save_owner_profile`, `admin_list_businesses` con el perfil; suite SQL.
- T3 UI: paso "Cuéntanos de ti" antes de "Tu negocio".
- T4 UI: pantalla única para negocios existentes sin perfil.
- T5 UI admin: nombre, WhatsApp (enlace) y tipo en la tarjeta.
- T6 migración: mensajes neutros en `schedule_appointment` y `complete_appointment`.

Ruta: todo inline (sin motivo de escritor paralelo). Riesgo: item 1 (tabla y datos persistidos nuevos), item 2 (RLS/`security definer`), item 3 (firma de `create_business` y `admin_list_businesses`).

## Log

- L1 (2026-11-05) Pedido: "vamos a mejorar tambien el registro para cuadno un usuario nuevo empieza en la app. Como funciona actualmente? que informaciones optenemos de los dueños de negocios?" / "Quiero conocer mas a mis clientes pero que tambien sea facil y rapido y ameno... Quiero que el registro sea profesional..."
- L2 Obligatorios: "Su nombre, Su whatsapp el tipo de negocio".
- L3 Existentes: "pidele los datos la proxima vez que entren."
- L4 Decisión: datos personales en tabla aparte sin SELECT directo (S6). Sin Docker local: las suites SQL se validan en CI.
