-- 38_demo_datos.sql
-- Datos de DEMO: 15 dias de ventas, compras, proveedores, clientes, ofertas, premio por
-- compras y sorteos, para que quien entre a la demo vea el sistema con vida.
--
-- SOLO toca el comercio con slug 'demo' y SOLO filas con id que empieza con 'demo_'.
-- Se puede correr las veces que quieras: cada corrida borra lo que sembro antes y lo
-- vuelve a generar, con fechas relativas a HOY (asi la demo siempre parece "de esta semana").
-- No toca ningun comercio real. Requiere 36_login_demo.sql (usuario demo) y 37_*.sql.
--
-- Son 15 dias (no 7) a proposito: las recomendaciones de que ofertar necesitan al menos 14 dias
-- de historia de ventas para poder medir cuanto rota cada producto.
--
-- Que deja para mirar:
--   Stock         -> productos con stock bajo, vencimientos cercanos, precios que cambiaron
--   Promociones   -> ofertas vigentes / por terminar / programada / una que no vende,
--                    recomendaciones (quieto, sin ventas, margen alto, sin costo, reposicion),
--                    historial y ranking de promos, premio por compras, sorteo hecho y uno abierto
--   Ventas/Caja   -> ~350 ventas en 15 dias, 15 cajas (la de hoy abierta), fiado y pagos
--   Compras       -> 5 proveedores y 13 compras (algunas a cuenta corriente sin pagar)
--   Clientes      -> 14 clientes con puntos y deuda

do $$
declare
  v_com      text;
  v_user_id  text;
  v_user     text;
  v_puesto   text;
  v_hoy      date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  d          integer;
  i          integer;
  n_ventas   integer;
  n_items    integer;
  v_dow      integer;
  v_ts       timestamptz;
  v_items    jsonb;
  v_total    numeric;
  v_cliente  text;
  v_metodo   text;
  v_r        numeric;
  v_caja     text;
  v_seq      bigint;
  v_cash     numeric;
  v_pagador  text;
  v_sorteo1  text := 'demo_sorteo_1';
begin
  select id into v_com from comercios where slug = 'demo';
  if v_com is null then
    raise exception 'No existe el comercio demo (slug = demo). Crealo primero.';
  end if;
  select id, nombre into v_user_id, v_user
    from usuarios where comercio_id = v_com and activo order by created_at limit 1;

  -- --------------------------------------------------------
  -- 0. Limpiar una siembra anterior (solo ids demo_ de este comercio)
  -- --------------------------------------------------------
  delete from puntos_mov          where comercio_id = v_com and cliente_id like 'demo\_%';
  delete from premios_compras     where comercio_id = v_com and id like 'demo\_%';
  delete from cuenta_corriente_mov where comercio_id = v_com and id like 'demo\_%';
  delete from sorteos             where comercio_id = v_com and id like 'demo\_%';
  delete from ventas              where comercio_id = v_com and id like 'demo\_%';
  delete from caja                where comercio_id = v_com and id like 'demo\_%';
  delete from compras             where comercio_id = v_com and id like 'demo\_%';
  delete from proveedores         where comercio_id = v_com and id like 'demo\_%';
  delete from stock_movimientos   where comercio_id = v_com and producto_id like 'demo\_%';
  delete from producto_auditoria  where comercio_id = v_com and producto_id like 'demo\_%';
  delete from ofertas_historial   where comercio_id = v_com and producto_id like 'demo\_%';
  delete from productos           where comercio_id = v_com and id like 'demo\_%';
  delete from clientes            where comercio_id = v_com and id like 'demo\_%';

  -- Puesto de caja
  select id into v_puesto from puestos where comercio_id = v_com and activo order by created_at limit 1;
  if v_puesto is null then
    v_puesto := 'demo_puesto_1';
    insert into puestos (id, comercio_id, nombre) values (v_puesto, v_com, 'Caja 1')
      on conflict (id) do nothing;
  end if;

  -- --------------------------------------------------------
  -- 1. Catalogo. w = cuanto se vende (0 = nada); prov = proveedor; venc = dias hasta vencer.
  --    Algunos estan armados a proposito para disparar cada recomendacion.
  -- --------------------------------------------------------
  create temp table tmp_prod (
    n integer, id text, nombre text, cat text, precio numeric, costo numeric,
    stock numeric, stock_min numeric, w numeric, unidad text, venc integer, prov integer
  ) on commit drop;

  insert into tmp_prod (n, nombre, cat, precio, costo, stock, stock_min, w, unidad, venc, prov) values
  ( 1,'Coca-Cola 2.25L','Bebidas',4200,3100,48,12,10,'un',null,2),
  ( 2,'Coca-Cola 500ml','Bebidas',1800,1250,60,24,12,'un',null,2),
  ( 3,'Agua mineral 500ml','Bebidas',1200,750,90,24,9,'un',null,2),
  ( 4,'Cerveza Quilmes 1L','Bebidas',3300,2400,36,12,8,'un',null,2),
  ( 5,'Fernet Branca 750ml','Bebidas',14500,11200,12,4,3,'un',null,1),
  ( 6,'Gatorade 500ml','Bebidas',2300,1650,30,12,4,'un',null,2),
  ( 7,'Jugo Cepita 1L','Bebidas',2100,1500,24,8,4,'un',null,2),
  ( 8,'Alfajor Milka triple','Golosinas',1600,1050,40,20,8,'un',null,3),
  ( 9,'Alfajor Jorgito','Golosinas',900,580,55,20,7,'un',null,3),
  (10,'Chicle Beldent','Golosinas',800,520,50,20,5,'un',null,3),
  (11,'Caramelos Sugus','Golosinas',700,430,40,10,3,'un',null,3),
  (12,'Chocolate Cofler 55g','Golosinas',1900,1300,25,10,5,'un',null,3),
  (13,'Bon o Bon caja x30','Golosinas',9800,7300,8,3,1,'un',null,3),
  (14,'Papas Lays 150g','Snacks',3200,2250,30,10,6,'un',null,1),
  (15,'Doritos 140g','Snacks',3400,2400,26,10,5,'un',null,1),
  (16,'Mani salado 200g','Snacks',1900,1200,20,6,2,'un',null,1),
  (17,'Palitos salados','Snacks',1500,950,18,6,2,'un',null,1),
  (18,'Yerba Playadito 1kg','Almacen',6900,5200,30,10,6,'un',null,1),
  (19,'Azucar Ledesma 1kg','Almacen',1900,1400,40,12,5,'un',null,1),
  (20,'Aceite Cocinero 900ml','Almacen',3900,2900,24,8,3,'un',null,1),
  (21,'Fideos Matarazzo 500g','Almacen',1700,1200,44,15,5,'un',null,1),
  (22,'Galletitas Criollitas','Almacen',1400,950,36,12,5,'un',null,3),
  (23,'Cafe Nescafe 170g','Almacen',8900,6800,10,4,1,'un',null,1),
  (24,'Leche La Serenisima 1L','Lacteos',1900,1400,5,15,9,'un',2,4),
  (25,'Yogur Ser bebible 1L','Lacteos',2300,1650,16,6,4,'un',3,4),
  (26,'Queso cremoso (kg)','Lacteos',9800,7400,6,2,3,'kg',5,4),
  (27,'Manteca La Paulina 200g','Lacteos',2500,1800,14,5,3,'un',1,4),
  (28,'Pan lactal Bimbo','Panificados',3100,2200,15,6,6,'un',4,5),
  (29,'Medialunas x6','Panificados',2800,1900,4,4,5,'un',1,5),
  (30,'Cigarrillos Marlboro box','Cigarrillos',5200,4700,12,15,12,'un',null,1),
  (31,'Cigarrillos Lucky Strike','Cigarrillos',4800,4300,30,10,8,'un',null,1),
  (32,'Pilas AA x2','Varios',2600,null,25,6,1,'un',null,1),
  (33,'Encendedor Bic','Varios',1500,null,40,10,2,'un',null,1),
  (34,'Papel higienico x4','Limpieza',4200,3000,30,10,3,'un',null,1),
  (35,'Detergente Magistral 500ml','Limpieza',3600,2500,20,6,2,'un',null,1),
  (36,'Alfajor artesanal caja x6','Golosinas',6500,3600,8,3,1.2,'un',null,3),
  (37,'The Green Hills x25','Almacen',2400,1500,30,8,0.5,'un',null,1),
  (38,'Sidra Cimarron 720ml','Bebidas',3800,2600,18,6,0,'un',null,2),
  (39,'Turron surtido caja','Golosinas',5400,3500,24,6,0,'un',null,3);

  update tmp_prod set id = 'demo_p_' || lpad(n::text, 2, '0');

  insert into productos
    (id, comercio_id, codigo, codigo_barras, name, description, price, precio_base, category,
     image_url, stock, stock_minimo, disabled, created_at, updated_at, fecha_vencimiento,
     unidad, stock_controlado, favorito, revisar)
  select id, v_com, 'D' || lpad(n::text, 3, '0'), '77990000' || lpad(n::text, 5, '0'), nombre, '',
         precio, costo, cat, '', stock, stock_min, false,
         now() - interval '15 days', now(),
         case when venc is null then null else v_hoy + venc end,
         unidad, true, n in (1, 2, 8, 30), false
    from tmp_prod;

  -- Ofertas: vigente que funciona, por terminar, programada, y una que NO vende (Gatorade)
  update productos set oferta_activa = true, oferta_tipo = 'combo', oferta_cantidad = 2, oferta_valor = 1800,
         oferta_desde = v_hoy - 8, oferta_hasta = v_hoy + 14
   where id = 'demo_p_02' and comercio_id = v_com;                                  -- Coca 500: 2x1
  update productos set oferta_activa = true, oferta_tipo = 'combo', oferta_cantidad = 3, oferta_valor = 1800,
         oferta_desde = v_hoy - 5, oferta_hasta = v_hoy + 2
   where id = 'demo_p_09' and comercio_id = v_com;                                  -- Jorgito 3x2, termina en 2 dias
  update productos set oferta_activa = true, oferta_tipo = 'porcentaje', oferta_valor = 15,
         oferta_desde = v_hoy - 3, oferta_hasta = v_hoy + 1
   where id = 'demo_p_14' and comercio_id = v_com;                                  -- Lays -15%, termina manana
  update productos set oferta_activa = true, oferta_tipo = 'porcentaje', oferta_valor = 20,
         oferta_desde = v_hoy - 5, oferta_hasta = v_hoy + 9
   where id = 'demo_p_06' and comercio_id = v_com;                                  -- Gatorade -20%: no vende
  update productos set oferta_activa = true, oferta_tipo = 'monto', oferta_valor = 200,
         oferta_desde = v_hoy - 6, oferta_hasta = null
   where id = 'demo_p_03' and comercio_id = v_com;                                  -- Agua -$200 sin fin
  update productos set oferta_activa = true, oferta_tipo = 'porcentaje', oferta_valor = 10,
         oferta_desde = v_hoy + 3, oferta_hasta = v_hoy + 10
   where id = 'demo_p_18' and comercio_id = v_com;                                  -- Yerba -10%, programada

  -- Precios que cambiaron esta semana (para reimprimir carteles)
  insert into producto_auditoria (id, comercio_id, producto_id, campo, valor_anterior, valor_nuevo, usuario_nombre, fecha)
  values
    ('demo_aud_1', v_com, 'demo_p_01', 'price', '3900', '4200', v_user, now() - interval '2 days'),
    ('demo_aud_2', v_com, 'demo_p_18', 'price', '6400', '6900', v_user, now() - interval '3 days'),
    ('demo_aud_3', v_com, 'demo_p_30', 'price', '4900', '5200', v_user, now() - interval '1 days'),
    ('demo_aud_4', v_com, 'demo_p_20', 'price', '3600', '3900', v_user, now() - interval '5 days');

  -- --------------------------------------------------------
  -- 2. Proveedores y compras
  -- --------------------------------------------------------
  insert into proveedores (id, comercio_id, nombre, telefono, notas) values
    ('demo_prov_1', v_com, 'Distribuidora J&J',       '3442-401122', 'Reparte martes y viernes'),
    ('demo_prov_2', v_com, 'Bebidas del Litoral',     '3442-455801', 'Retornables: devolver envases'),
    ('demo_prov_3', v_com, 'Arcor - Sucursal Litoral','3442-430077', 'Pedido minimo $80.000'),
    ('demo_prov_4', v_com, 'Lacteos La Serenisima',   '3442-498310', 'Entrega diaria antes de las 9'),
    ('demo_prov_5', v_com, 'Panaderia Don Atilio',    '3442-412266', 'Pan y medialunas, pedir el dia anterior');

  -- 13 compras: (dias atras, proveedor, condicion, pagada)
  create temp table tmp_compra (k integer, dias integer, prov integer, cond text, pagada boolean) on commit drop;
  insert into tmp_compra values
    (1,14,1,'contado',true),(2,13,2,'contado',true),(3,12,3,'cuenta_corriente',true),(4,11,4,'contado',true),
    (5,10,1,'contado',true),(6,9,2,'contado',true),(7,8,5,'contado',true),(8,7,3,'cuenta_corriente',true),
    (9,5,1,'cuenta_corriente',false),(10,4,4,'contado',true),(11,3,2,'cuenta_corriente',false),
    (12,2,5,'contado',true),(13,1,4,'contado',true);

  insert into compras (id, comercio_id, proveedor_id, estado, remito, condicion, pagada, total, notas, usuario_id, usuario_nombre, created_at)
  select 'demo_compra_' || k, v_com, 'demo_prov_' || prov, 'recibida',
         'R-' || lpad((4000 + k * 37)::text, 6, '0'), cond, pagada, 0, null, v_user_id, v_user,
         ((v_hoy - dias)::timestamp + time '09:30') at time zone 'America/Argentina/Buenos_Aires'
    from tmp_compra;

  -- Items: 4 productos del rubro de cada proveedor, con un costo apenas distinto al vigente
  insert into compra_items (compra_id, comercio_id, producto_id, producto_nombre, cantidad, costo_unitario, subtotal)
  select 'demo_compra_' || c.k, v_com, p.id, p.nombre,
         q.cant, q.costo, q.cant * q.costo
    from tmp_compra c
    join lateral (
      select * from tmp_prod where prov = c.prov order by md5(c.k::text || n::text) limit 4
    ) p on true
    join lateral (
      select (12 + (abs(hashtext(c.k::text || p.id)) % 5) * 6)::numeric as cant,
             round(coalesce(p.costo, p.precio * 0.7) * (0.97 + (abs(hashtext(p.id || c.k::text)) % 7) / 100.0)) as costo
    ) q on true;

  update compras c set total = coalesce((select sum(subtotal) from compra_items where compra_id = c.id), 0)
   where c.comercio_id = v_com and c.id like 'demo\_%';

  insert into stock_movimientos (id, comercio_id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo, referencia, usuario, fecha)
  select gen_random_uuid()::text, v_com, ci.producto_id, 'entrada', ci.cantidad, 0, ci.cantidad,
         ci.compra_id, v_user, c.created_at
    from compra_items ci join compras c on c.id = ci.compra_id
   where ci.comercio_id = v_com and ci.compra_id like 'demo\_%';

  -- --------------------------------------------------------
  -- 3. Clientes (los primeros compran mucho)
  -- --------------------------------------------------------
  create temp table tmp_cli (n integer, id text, nombre text, tel text, peso numeric, limite numeric) on commit drop;
  insert into tmp_cli (n, nombre, tel, peso, limite) values
    (1,'Marcela Gomez','3442-600101',9,50000),(2,'Julian Pereyra','3442-600102',7,30000),
    (3,'Carla Benitez','3442-600103',6,0),(4,'Don Roberto Sosa','3442-600104',6,40000),
    (5,'Lucia Fernandez','3442-600105',4,0),(6,'Matias Rios','3442-600106',3,20000),
    (7,'Sandra Molina','3442-600107',3,0),(8,'Diego Acuna','3442-600108',2,0),
    (9,'Valeria Luna','3442-600109',2,15000),(10,'Nicolas Ibarra','3442-600110',2,0),
    (11,'Paula Ortiz','3442-600111',1,0),(12,'Esteban Vega','3442-600112',1,0),
    (13,'Rosa Cabrera','3442-600113',1,10000),(14,'Familia Quiroga','3442-600114',1,0);
  update tmp_cli set id = 'demo_cli_' || n;

  insert into clientes (id, comercio_id, nombre, telefono, limite_credito, saldo, puntos, activo, created_at, updated_at)
  select id, v_com, nombre, tel, limite, 0, 0, true, now() - interval '60 days', now() from tmp_cli;

  -- --------------------------------------------------------
  -- 4. Cajas (una por dia; la de hoy queda abierta) y ventas
  -- --------------------------------------------------------
  for d in reverse 14..0 loop
    v_caja := 'demo_caja_' || d;
    -- Solo la de hoy queda abierta: la base permite una sola caja abierta por puesto
    insert into caja (id, comercio_id, puesto_id, estado, monto_apertura, abierta_por, abierta_por_nombre,
                      opened_at, closed_at, cerrada_por)
    values (v_caja, v_com, v_puesto, case when d = 0 then 'abierta' else 'cerrada' end, 20000, v_user_id, v_user,
            ((v_hoy - d)::timestamp + time '08:00') at time zone 'America/Argentina/Buenos_Aires',
            case when d = 0 then null
                 else ((v_hoy - d)::timestamp + time '21:30') at time zone 'America/Argentina/Buenos_Aires' end,
            case when d = 0 then null else v_user_id end);
  end loop;

  -- Ritmo por dia: mas fuerte viernes y sabado
  for d in reverse 14..0 loop
    v_dow := extract(dow from (v_hoy - d))::integer;   -- 0 = domingo
    n_ventas := case when v_dow in (5, 6) then 26 + floor(random() * 10)::integer
                     when v_dow = 0 then 14 + floor(random() * 6)::integer
                     else 16 + floor(random() * 8)::integer end;
    v_caja := 'demo_caja_' || d;

    for i in 1..n_ventas loop
      v_ts := ((v_hoy - d)::timestamp + make_interval(hours => 8 + floor(random() * 13)::integer,
                                                      mins => floor(random() * 60)::integer))
              at time zone 'America/Argentina/Buenos_Aires';
      if d = 0 and v_ts > now() then
        v_ts := now() - make_interval(mins => i);      -- hoy: nada en el futuro
      end if;

      n_items := 1 + floor(random() * random() * 5)::integer;

      -- Productos sorteados con probabilidad proporcional a su peso (Efraimidis-Spirakis).
      -- Ajustes por dia: Coca 500 vende mas con su 2x1; Gatorade cae cuando arranca el -20%.
      select jsonb_agg(jsonb_build_object(
               'productId', s.id, 'name', s.nombre, 'quantity', s.q, 'price', s.precio,
               'subtotal', round(s.q * s.precio))),
             sum(round(s.q * s.precio))
        into v_items, v_total
        from (
          select id, nombre, precio,
                 case when unidad = 'kg' then (array[0.25, 0.5, 1])[1 + floor(random() * 3)::integer]
                      when random() < 0.22 then 2 else 1 end as q
            from tmp_prod
           where w > 0
           order by -ln(random()) / (w * case
                        when id = 'demo_p_02' and d <= 8 then 1.7
                        when id = 'demo_p_06' and d > 5 then 2.2
                        when id = 'demo_p_06' and d <= 5 then 0.15
                        else 1 end)
           limit n_items
        ) s;

      -- Cliente: ~42% de las ventas, con los habituales mas seguido
      v_cliente := null;
      if random() < 0.42 then
        select id into v_cliente from tmp_cli order by -ln(random()) / peso limit 1;
      end if;

      v_r := random();
      v_metodo := case when v_r < 0.46 then 'efectivo'
                       when v_r < 0.66 then 'transferencia'
                       when v_r < 0.80 then 'debito'
                       when v_r < 0.86 then 'credito'
                       when v_r < 0.93 then 'mercadopago'
                       else 'fiado' end;
      if v_metodo = 'fiado' and v_cliente is null then v_metodo := 'efectivo'; end if;

      v_cash := case when v_metodo = 'efectivo' then ceil(v_total / 500.0) * 500 else 0 end;
      v_pagador := case when v_metodo in ('transferencia', 'debito', 'credito')
                        then (array['Ana Paredes','Luis Correa','Marta Silva','Pablo Duarte','Julia Rey'])[1 + floor(random() * 5)::integer]
                        else null end;

      v_seq := nextval('ventas_seq');
      insert into ventas
        (id, comercio_id, sale_number, items, total, discount, payment_method, cash_amount, change_amount,
         transfer_amount, caja_id, user_id, user_name, cliente_id, pagador_nombre, cuotas, recargo_pct,
         estado, created_at)
      values
        ('demo_venta_' || v_seq, v_com, lpad(v_seq::text, 8, '0'), v_items, v_total, 0, v_metodo,
         v_cash, greatest(v_cash - v_total, 0),
         case when v_metodo = 'transferencia' then v_total else 0 end,
         v_caja, v_user_id, v_user, v_cliente, v_pagador,
         case when v_metodo = 'credito' then 1 else null end, 0,
         'completada', v_ts);
    end loop;
  end loop;

  -- Un par de ventas anuladas (para que se vea el historial de anulaciones)
  update ventas set estado = 'anulada', anulada_at = created_at + interval '10 minutes',
         anulada_por = v_user_id, anulada_por_nombre = v_user, motivo_anulacion = 'Error de carga'
   where id in (select id from ventas where comercio_id = v_com and id like 'demo\_venta\_%'
                  and created_at < now() - interval '3 days' order by created_at desc limit 3);

  -- Totales de cada caja + cierre con arqueo
  update caja c set
    total_efectivo      = coalesce(t.efectivo, 0),
    total_transferencia = coalesce(t.transferencia, 0),
    total_mercadopago   = coalesce(t.mp, 0),
    total_ventas        = coalesce(t.total, 0),
    cantidad_ventas     = coalesce(t.cant, 0)
  from (
    select caja_id,
           sum(cash_amount - change_amount) filter (where payment_method = 'efectivo') as efectivo,
           sum(transfer_amount) as transferencia,
           sum(total) filter (where payment_method in ('mercadopago', 'qr', 'mercadopago_point')) as mp,
           sum(total) as total, count(*) as cant
      from ventas where comercio_id = v_com and estado = 'completada' and caja_id like 'demo\_caja\_%'
     group by caja_id
  ) t
  where c.id = t.caja_id and c.comercio_id = v_com;

  update caja set diferencia = (array[0, 0, 0, -200, 150, 0, -500, 0])[1 + floor(random() * 8)::integer]
   where comercio_id = v_com and id like 'demo\_caja\_%' and estado = 'cerrada';
  update caja set monto_cierre = monto_apertura + total_efectivo + coalesce(diferencia, 0)
   where comercio_id = v_com and estado = 'cerrada' and id like 'demo\_caja\_%';

  -- --------------------------------------------------------
  -- 5. Fiado: cada venta fiada carga deuda; algunos clientes pagaron parte
  -- --------------------------------------------------------
  insert into cuenta_corriente_mov (id, comercio_id, cliente_id, tipo, monto, venta_id, usuario, fecha)
  select 'demo_cc_v_' || v.id, v_com, v.cliente_id, 'cargo', v.total, v.id, v_user, v.created_at
    from ventas v
   where v.comercio_id = v_com and v.id like 'demo\_venta\_%'
     and v.payment_method = 'fiado' and v.estado = 'completada';

  -- Pagos: a los clientes con deuda se les registra un pago del 60% de lo adeudado hace 4+ dias
  insert into cuenta_corriente_mov (id, comercio_id, cliente_id, tipo, monto, referencia, usuario, fecha)
  select 'demo_cc_p_' || cliente_id, v_com, cliente_id, 'pago', round(sum(monto) * 0.6, -2), 'Pago en efectivo', v_user,
         now() - interval '4 days'
    from cuenta_corriente_mov
   where comercio_id = v_com and id like 'demo\_cc\_v\_%' and tipo = 'cargo'
   group by cliente_id
  having sum(monto) * 0.6 >= 100 and (abs(hashtext(cliente_id)) % 3) <> 0;

  -- Saldos anterior/nuevo encadenados y saldo final del cliente
  with ordenados as (
    select id, cliente_id,
           sum(case when tipo = 'cargo' then monto else -monto end)
             over (partition by cliente_id order by fecha, id) as nuevo,
           case when tipo = 'cargo' then monto else -monto end as delta
      from cuenta_corriente_mov where comercio_id = v_com and id like 'demo\_cc\_%'
  )
  update cuenta_corriente_mov m set saldo_nuevo = o.nuevo, saldo_anterior = o.nuevo - o.delta
    from ordenados o where m.id = o.id;

  update clientes c set saldo = greatest(coalesce((
      select sum(case when tipo = 'cargo' then monto else -monto end)
        from cuenta_corriente_mov where cliente_id = c.id), 0), 0)
   where c.comercio_id = v_com and c.id like 'demo\_%';

  -- --------------------------------------------------------
  -- 6. Puntos por monto ($100 = 1 punto, igual que la venta real) e historial
  -- --------------------------------------------------------
  insert into puntos_mov (id, comercio_id, cliente_id, tipo, puntos, venta_id, usuario, fecha)
  select 'demo_pt_' || v.id, v_com, v.cliente_id, 'ganado', floor(v.total / 100), v.id, v_user, v.created_at
    from ventas v
   where v.comercio_id = v_com and v.id like 'demo\_venta\_%' and v.cliente_id is not null
     and v.estado = 'completada' and floor(v.total / 100) > 0;

  update clientes c set puntos = coalesce((select sum(puntos) from puntos_mov where cliente_id = c.id), 0)
   where c.comercio_id = v_com and c.id like 'demo\_%';

  -- --------------------------------------------------------
  -- 7. Ofertas terminadas: alimentan el ranking de "que promos me funcionan"
  -- --------------------------------------------------------
  insert into ofertas_historial
    (comercio_id, producto_id, producto_nombre, tipo, valor, cantidad, desde, hasta, finalizada_at,
     unidades_durante, facturado_durante, por_dia_antes, por_dia_durante, variacion_pct)
  values
    (v_com,'demo_p_21','Fideos Matarazzo 500g','combo',2400,2, v_hoy-40,v_hoy-33, now()-interval '33 days', 61,  73200, 4.1, 8.7,  112),
    (v_com,'demo_p_08','Alfajor Milka triple','combo',3200,3, v_hoy-38,v_hoy-31, now()-interval '31 days', 88, 112000, 3.9, 12.6, 223),
    (v_com,'demo_p_10','Chicle Beldent','porcentaje',10,null, v_hoy-36,v_hoy-29, now()-interval '29 days', 30,  21600, 3.6, 4.3,   19),
    (v_com,'demo_p_15','Doritos 140g','porcentaje',15,null, v_hoy-35,v_hoy-28, now()-interval '28 days', 34,  92500, 2.9, 4.9,   69),
    (v_com,'demo_p_04','Cerveza Quilmes 1L','porcentaje',20,null, v_hoy-34,v_hoy-27, now()-interval '27 days', 71, 187000, 5.2, 10.1,  94),
    (v_com,'demo_p_12','Chocolate Cofler 55g','porcentaje',30,null, v_hoy-33,v_hoy-26, now()-interval '26 days', 39,  52000, 3.1, 5.6,   81),
    (v_com,'demo_p_20','Aceite Cocinero 900ml','porcentaje',40,null, v_hoy-32,v_hoy-25, now()-interval '25 days', 19,  44500, 1.7, 2.7,   59),
    (v_com,'demo_p_22','Galletitas Criollitas','monto',150,null, v_hoy-31,v_hoy-24, now()-interval '24 days', 33,  41300, 3.8, 4.7,   24),
    (v_com,'demo_p_07','Jugo Cepita 1L','combo',3600,2, v_hoy-30,v_hoy-23, now()-interval '23 days', 30,  54000, 2.4, 4.3,   79),
    (v_com,'demo_p_35','Detergente Magistral 500ml','porcentaje',10,null, v_hoy-29,v_hoy-22, now()-interval '22 days', 12, 38900, 1.5, 1.7, 13);

  -- --------------------------------------------------------
  -- 8. Premio por compras (cada 5 compras de $1.500 o mas) y sorteos
  -- --------------------------------------------------------
  insert into fidelidad_compras_config (comercio_id, activo, compras_meta, monto_minimo, premio, desde, updated_at)
  values (v_com, true, 5, 1500, 'Cafe + medialuna gratis', v_hoy - 14, now())
  on conflict (comercio_id) do update
    set activo = true, compras_meta = 5, monto_minimo = 1500,
        premio = 'Cafe + medialuna gratis', desde = v_hoy - 14, updated_at = now();

  -- Un premio ya entregado a la clienta mas fiel (gasta 5 de sus compras)
  insert into premios_compras (id, comercio_id, cliente_id, premio, compras_usadas, usuario, fecha)
  values ('demo_premio_1', v_com, 'demo_cli_1', 'Cafe + medialuna gratis', 5, v_user, now() - interval '9 days');

  -- Sorteo ya hecho: se elige el ganador de verdad con la misma funcion que usa la app
  insert into sorteos (id, comercio_id, nombre, premio, desde, hasta, monto_por_chance, estado, created_at)
  values (v_sorteo1, v_com, 'Sorteo Dia del Nino', 'Canasta de golosinas', v_hoy - 14, v_hoy - 6, 3000,
          'abierto', (v_hoy - 15)::timestamp at time zone 'America/Argentina/Buenos_Aires');
  perform sortear_kiosko(v_sorteo1, v_com, v_user);
  update sorteos set sorteado_at = ((v_hoy - 5)::timestamp + time '20:00') at time zone 'America/Argentina/Buenos_Aires'
   where id = v_sorteo1;

  -- Sorteo en curso: la gente ya viene sumando chances
  insert into sorteos (id, comercio_id, nombre, premio, desde, hasta, monto_por_chance, estado, created_at)
  values ('demo_sorteo_2', v_com, 'Sorteo de fin de mes', 'Pack de 6 Coca-Cola 2.25L + $20.000 en compras',
          v_hoy - 5, v_hoy + 12, 2500, 'abierto', (v_hoy - 6)::timestamp at time zone 'America/Argentina/Buenos_Aires');

  raise notice 'Demo lista: % ventas, % compras, % clientes.',
    (select count(*) from ventas where comercio_id = v_com and id like 'demo\_%'),
    (select count(*) from compras where comercio_id = v_com and id like 'demo\_%'),
    (select count(*) from clientes where comercio_id = v_com and id like 'demo\_%');
end;
$$;

-- CHEQUEO (correr aparte): deberia dar ~300 ventas, 13 compras, 14 clientes.
--   select (select count(*) from ventas   where id like 'demo\_%') ventas,
--          (select count(*) from compras  where id like 'demo\_%') compras,
--          (select count(*) from clientes where id like 'demo\_%') clientes;
