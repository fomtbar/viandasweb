/*
  DATETIME2 -> DATETIMEOFFSET en las columnas de instante.

  Motivo: la base es COMPARTIDA con otros sistemas. Un DATETIME2 no lleva zona,
  y la app guarda UTC (ver useUTC en src/lib/prisma.ts): quien consultara la
  tabla desde SSMS o un reporte leia 3 horas de mas sin manera de notarlo.
  DATETIMEOFFSET conserva el instante y lo deja explicito.

  La conversion es exacta: SQL Server asume +00:00 para el valor DATETIME2
  existente, que es justamente la zona en la que se venia guardando.

  NO toca las columnas @db.Date (fecha_solicitud): esas son fechas sin hora y
  se construyen con Date.UTC() a proposito (ver src/lib/tiempo.ts).

  Dos cosas que `prisma migrate diff` NO resolvio y hubo que agregar a mano:
    1. Genero un DROP TABLE [dbo].[sysdiagrams]: esa tabla es de OTRO sistema
       que comparte esta base. Se quito.
    2. No contemplo los DEFAULT constraints de creado_at, que bloquean el
       ALTER COLUMN con el error 5074. Se eliminan y se recrean.

  El DEFAULT se recrea con CURRENT_TIMESTAMP y no con SYSDATETIMEOFFSET() para
  no divergir de lo que genera Prisma. Es letra muerta: el INSERT de Prisma
  siempre manda creado_at explicito (verificado sobre el SQL emitido).
*/

BEGIN TRY

BEGIN TRAN;

-- Los indices sobre creado_at bloquean el ALTER COLUMN: se recrean al final.
DROP INDEX [IX_viandas_pedidos_creado] ON [dbo].[viandas_pedidos];
DROP INDEX [IX_viandas_pedidos_solicitante_creado] ON [dbo].[viandas_pedidos];

-- Los DEFAULT tambien bloquean el ALTER COLUMN (error 5074).
ALTER TABLE [dbo].[viandas_empleados] DROP CONSTRAINT [viandas_empleados_creado_at_df];
ALTER TABLE [dbo].[viandas_usuarios]  DROP CONSTRAINT [viandas_usuarios_creado_at_df];
ALTER TABLE [dbo].[viandas_pedidos]   DROP CONSTRAINT [viandas_pedidos_creado_at_df];

-- AlterTable
ALTER TABLE [dbo].[viandas_empleados] ALTER COLUMN [creado_at] DATETIMEOFFSET NOT NULL;

-- AlterTable
ALTER TABLE [dbo].[viandas_pedidos] ALTER COLUMN [creado_at] DATETIMEOFFSET NOT NULL;
ALTER TABLE [dbo].[viandas_pedidos] ALTER COLUMN [cancelado_at] DATETIMEOFFSET NULL;

-- AlterTable
ALTER TABLE [dbo].[viandas_usuarios] ALTER COLUMN [password_actualizado_at] DATETIMEOFFSET NULL;
ALTER TABLE [dbo].[viandas_usuarios] ALTER COLUMN [ultimo_login_at] DATETIMEOFFSET NULL;
ALTER TABLE [dbo].[viandas_usuarios] ALTER COLUMN [creado_at] DATETIMEOFFSET NOT NULL;

-- Se recrean los DEFAULT con el mismo nombre y definicion que tenian.
ALTER TABLE [dbo].[viandas_empleados] ADD CONSTRAINT [viandas_empleados_creado_at_df] DEFAULT CURRENT_TIMESTAMP FOR [creado_at];
ALTER TABLE [dbo].[viandas_usuarios]  ADD CONSTRAINT [viandas_usuarios_creado_at_df]  DEFAULT CURRENT_TIMESTAMP FOR [creado_at];
ALTER TABLE [dbo].[viandas_pedidos]   ADD CONSTRAINT [viandas_pedidos_creado_at_df]   DEFAULT CURRENT_TIMESTAMP FOR [creado_at];

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_viandas_pedidos_solicitante_creado] ON [dbo].[viandas_pedidos]([solicitante_legajo], [creado_at] DESC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_viandas_pedidos_creado] ON [dbo].[viandas_pedidos]([creado_at] DESC);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
