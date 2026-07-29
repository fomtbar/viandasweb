BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[viandas_sectores] (
    [id] INT NOT NULL IDENTITY(1,1),
    [nombre] NVARCHAR(120) NOT NULL,
    [activo] BIT NOT NULL CONSTRAINT [viandas_sectores_activo_df] DEFAULT 1,
    CONSTRAINT [viandas_sectores_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_viandas_sectores_nombre] UNIQUE NONCLUSTERED ([nombre])
);

-- CreateTable
CREATE TABLE [dbo].[viandas_cargos] (
    [id] INT NOT NULL IDENTITY(1,1),
    [codigo] NVARCHAR(30) NOT NULL,
    [descripcion] NVARCHAR(120),
    [es_lider] BIT NOT NULL CONSTRAINT [viandas_cargos_es_lider_df] DEFAULT 0,
    [activo] BIT NOT NULL CONSTRAINT [viandas_cargos_activo_df] DEFAULT 1,
    CONSTRAINT [viandas_cargos_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_viandas_cargos_codigo] UNIQUE NONCLUSTERED ([codigo])
);

-- CreateTable
CREATE TABLE [dbo].[viandas_turnos] (
    [id] INT NOT NULL IDENTITY(1,1),
    [nombre] NVARCHAR(80) NOT NULL,
    [activo] BIT NOT NULL CONSTRAINT [viandas_turnos_activo_df] DEFAULT 1,
    CONSTRAINT [viandas_turnos_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_viandas_turnos_nombre] UNIQUE NONCLUSTERED ([nombre])
);

-- CreateTable
CREATE TABLE [dbo].[viandas_overtime_ventanas] (
    [id] INT NOT NULL IDENTITY(1,1),
    [orden] INT NOT NULL CONSTRAINT [viandas_overtime_ventanas_orden_df] DEFAULT 0,
    [ot_previo] NVARCHAR(40),
    [turno_horario] NVARCHAR(40),
    [ot_posterior] NVARCHAR(40),
    [ot_previo_desde_min] INT,
    [ot_previo_hasta_min] INT,
    [ot_posterior_desde_min] INT,
    [ot_posterior_hasta_min] INT,
    [activo] BIT NOT NULL CONSTRAINT [viandas_overtime_ventanas_activo_df] DEFAULT 1,
    CONSTRAINT [viandas_overtime_ventanas_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[viandas_empleados] (
    [id] INT NOT NULL IDENTITY(1,1),
    [legajo] INT NOT NULL,
    [apellido_nombre] NVARCHAR(150) NOT NULL,
    [cargo_id] INT,
    [sector_id] INT,
    [turno_id] INT,
    [es_externo] BIT NOT NULL CONSTRAINT [viandas_empleados_es_externo_df] DEFAULT 0,
    [activo] BIT NOT NULL CONSTRAINT [viandas_empleados_activo_df] DEFAULT 1,
    [creado_at] DATETIME2 NOT NULL CONSTRAINT [viandas_empleados_creado_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [viandas_empleados_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_viandas_empleados_legajo] UNIQUE NONCLUSTERED ([legajo])
);

-- CreateTable
CREATE TABLE [dbo].[viandas_usuarios] (
    [id] INT NOT NULL IDENTITY(1,1),
    [legajo] INT NOT NULL,
    [password_hash] NVARCHAR(72) NOT NULL,
    [debe_cambiar_password] BIT NOT NULL CONSTRAINT [viandas_usuarios_debe_cambiar_password_df] DEFAULT 1,
    [password_actualizado_at] DATETIME2,
    [ultimo_login_at] DATETIME2,
    [email] NVARCHAR(200),
    [sector_default_id] INT,
    [es_admin] BIT NOT NULL CONSTRAINT [viandas_usuarios_es_admin_df] DEFAULT 0,
    [es_gl] BIT NOT NULL CONSTRAINT [viandas_usuarios_es_gl_df] DEFAULT 1,
    [activo] BIT NOT NULL CONSTRAINT [viandas_usuarios_activo_df] DEFAULT 1,
    [creado_at] DATETIME2 NOT NULL CONSTRAINT [viandas_usuarios_creado_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [viandas_usuarios_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_viandas_usuarios_legajo] UNIQUE NONCLUSTERED ([legajo])
);

-- CreateTable
CREATE TABLE [dbo].[viandas_motivos] (
    [id] INT NOT NULL IDENTITY(1,1),
    [texto] NVARCHAR(200) NOT NULL,
    [usos] INT NOT NULL CONSTRAINT [viandas_motivos_usos_df] DEFAULT 0,
    [activo] BIT NOT NULL CONSTRAINT [viandas_motivos_activo_df] DEFAULT 1,
    CONSTRAINT [viandas_motivos_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_viandas_motivos_texto] UNIQUE NONCLUSTERED ([texto])
);

-- CreateTable
CREATE TABLE [dbo].[viandas_preferencias] (
    [clave] NVARCHAR(60) NOT NULL,
    [valor] NVARCHAR(max) NOT NULL,
    CONSTRAINT [viandas_preferencias_pkey] PRIMARY KEY CLUSTERED ([clave])
);

-- CreateTable
CREATE TABLE [dbo].[viandas_usuario_preferencias] (
    [usuario_id] INT NOT NULL,
    [clave] NVARCHAR(60) NOT NULL,
    [valor] NVARCHAR(max) NOT NULL,
    CONSTRAINT [viandas_usuario_preferencias_pkey] PRIMARY KEY CLUSTERED ([usuario_id],[clave])
);

-- CreateTable
CREATE TABLE [dbo].[viandas_pedidos] (
    [id] INT NOT NULL IDENTITY(1,1),
    [creado_at] DATETIME2 NOT NULL CONSTRAINT [viandas_pedidos_creado_at_df] DEFAULT CURRENT_TIMESTAMP,
    [fecha_solicitud] DATE NOT NULL,
    [retiro_desde_min] INT NOT NULL,
    [retiro_hasta_min] INT,
    [solicitante_legajo] INT NOT NULL,
    [cantidad_viandas] INT NOT NULL,
    [motivo] NVARCHAR(200) NOT NULL,
    [destinatarios_to] NVARCHAR(500) NOT NULL,
    [destinatarios_cc] NVARCHAR(500),
    [asunto] NVARCHAR(300) NOT NULL,
    [cuerpo] NVARCHAR(max) NOT NULL,
    [metodo_envio] NVARCHAR(20) NOT NULL CONSTRAINT [viandas_pedidos_metodo_envio_df] DEFAULT 'mailto',
    [estado] NVARCHAR(20) NOT NULL CONSTRAINT [viandas_pedidos_estado_df] DEFAULT 'borrador',
    [fuera_de_ventana_ot] BIT NOT NULL CONSTRAINT [viandas_pedidos_fuera_de_ventana_ot_df] DEFAULT 0,
    [cancelado_at] DATETIME2,
    [cancelado_por_legajo] INT,
    [cancelacion_motivo] NVARCHAR(300),
    CONSTRAINT [viandas_pedidos_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[viandas_pedido_items] (
    [id] INT NOT NULL IDENTITY(1,1),
    [pedido_id] INT NOT NULL,
    [legajo] INT,
    [apellido_nombre] NVARCHAR(150) NOT NULL,
    [sector_nombre] NVARCHAR(120),
    [cargo_nombre] NVARCHAR(120),
    [es_externo] BIT NOT NULL CONSTRAINT [viandas_pedido_items_es_externo_df] DEFAULT 0,
    CONSTRAINT [viandas_pedido_items_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_viandas_sectores_activo_nombre] ON [dbo].[viandas_sectores]([activo], [nombre]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_viandas_ot_ventanas_activo_orden] ON [dbo].[viandas_overtime_ventanas]([activo], [orden]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_viandas_empleados_activo_sector] ON [dbo].[viandas_empleados]([activo], [sector_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_viandas_empleados_apellido_nombre] ON [dbo].[viandas_empleados]([apellido_nombre]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_viandas_usuarios_activo_roles] ON [dbo].[viandas_usuarios]([activo], [es_gl], [es_admin]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_viandas_motivos_activo_usos] ON [dbo].[viandas_motivos]([activo], [usos] DESC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_viandas_pedidos_solicitante_creado] ON [dbo].[viandas_pedidos]([solicitante_legajo], [creado_at] DESC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_viandas_pedidos_creado] ON [dbo].[viandas_pedidos]([creado_at] DESC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_viandas_pedidos_estado_fecha] ON [dbo].[viandas_pedidos]([estado], [fecha_solicitud] DESC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_viandas_pedido_items_pedido] ON [dbo].[viandas_pedido_items]([pedido_id]);

-- AddForeignKey
ALTER TABLE [dbo].[viandas_empleados] ADD CONSTRAINT [viandas_empleados_cargo_id_fkey] FOREIGN KEY ([cargo_id]) REFERENCES [dbo].[viandas_cargos]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[viandas_empleados] ADD CONSTRAINT [viandas_empleados_sector_id_fkey] FOREIGN KEY ([sector_id]) REFERENCES [dbo].[viandas_sectores]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[viandas_empleados] ADD CONSTRAINT [viandas_empleados_turno_id_fkey] FOREIGN KEY ([turno_id]) REFERENCES [dbo].[viandas_turnos]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[viandas_usuarios] ADD CONSTRAINT [viandas_usuarios_legajo_fkey] FOREIGN KEY ([legajo]) REFERENCES [dbo].[viandas_empleados]([legajo]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[viandas_usuarios] ADD CONSTRAINT [viandas_usuarios_sector_default_id_fkey] FOREIGN KEY ([sector_default_id]) REFERENCES [dbo].[viandas_sectores]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[viandas_usuario_preferencias] ADD CONSTRAINT [viandas_usuario_preferencias_usuario_id_fkey] FOREIGN KEY ([usuario_id]) REFERENCES [dbo].[viandas_usuarios]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[viandas_pedidos] ADD CONSTRAINT [viandas_pedidos_solicitante_legajo_fkey] FOREIGN KEY ([solicitante_legajo]) REFERENCES [dbo].[viandas_empleados]([legajo]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[viandas_pedidos] ADD CONSTRAINT [viandas_pedidos_cancelado_por_legajo_fkey] FOREIGN KEY ([cancelado_por_legajo]) REFERENCES [dbo].[viandas_empleados]([legajo]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[viandas_pedido_items] ADD CONSTRAINT [viandas_pedido_items_pedido_id_fkey] FOREIGN KEY ([pedido_id]) REFERENCES [dbo].[viandas_pedidos]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
