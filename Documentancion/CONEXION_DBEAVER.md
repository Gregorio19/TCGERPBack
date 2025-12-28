# Guía de Conexión a la Base de Datos desde DBeaver

## 📋 Información de Conexión

Tu base de datos está alojada en **Neon** (PostgreSQL en la nube).

### Pasos para Conectarte desde DBeaver

#### 1. Extraer información de la URL de conexión

Tu `DATABASE_URL` tiene el formato:
```
postgresql://usuario:contraseña@host:puerto/nombre_base_datos?sslmode=require
```

Para obtener los valores exactos, ejecuta en tu terminal:
```bash
cd "/Users/cesarartunduaga/chicho /Proyectos/Pandi/TCG ERP/back"
cat .env | grep DATABASE_URL
```

O si prefieres verlo parseado:
```bash
node -e "const url = new URL(process.env.DATABASE_URL || 'postgresql://user:pass@host:5432/dbname'); console.log('Host:', url.hostname); console.log('Puerto:', url.port || 5432); console.log('Base de datos:', url.pathname.slice(1)); console.log('Usuario:', url.username);"
```

#### 2. Configurar DBeaver

1. **Abrir DBeaver** y hacer clic en **"Nueva Conexión"** (icono de enchufe) o `Archivo > Nueva > Conexión a Base de Datos`

2. **Seleccionar PostgreSQL** de la lista de bases de datos

3. **Configurar los parámetros de conexión**:

   - **Host**: `ep-empty-mountain-aekk5alv-pooler.c-2.us-east-2.aws.neon.tech`
   - **Puerto**: `5432` (o el que aparezca en tu DATABASE_URL)
   - **Base de datos**: `neondb` (o el nombre que aparezca en tu DATABASE_URL)
   - **Usuario**: (el usuario de tu DATABASE_URL)
   - **Contraseña**: (la contraseña de tu DATABASE_URL)

4. **Configurar SSL** (IMPORTANTE para Neon):
   - Ve a la pestaña **"SSL"**
   - Marca **"Use SSL"**
   - En **"SSL Mode"** selecciona: **"require"** o **"verify-full"**

5. **Probar la conexión**:
   - Haz clic en **"Probar conexión"**
   - Si es la primera vez, DBeaver te pedirá descargar el driver de PostgreSQL (acepta)

6. **Guardar y conectar**:
   - Haz clic en **"Finalizar"**
   - La conexión aparecerá en el panel izquierdo

### 🔍 Verificar la Conexión

Una vez conectado, deberías poder ver:
- Todas las tablas del esquema (products, customers, orders, etc.)
- Datos de ejemplo si ejecutaste los seeds
- Estructura de las tablas, relaciones, índices, etc.

### 📝 Notas Importantes

- **SSL es obligatorio**: Neon requiere conexiones SSL, asegúrate de habilitarlo
- **Pooler**: La URL usa un pooler de Neon, esto es normal y mejora el rendimiento
- **Credenciales**: Las credenciales están en tu archivo `.env` (no las compartas)

### 🛠️ Script de Ayuda (Opcional)

Si quieres un script que te muestre los valores parseados de forma segura:

```bash
#!/bin/bash
# parse_db_url.sh
if [ -f .env ]; then
  DATABASE_URL=$(grep DATABASE_URL .env | cut -d '=' -f2-)
  if [ -n "$DATABASE_URL" ]; then
    echo "Host: $(echo $DATABASE_URL | sed -E 's|.*@([^:]+).*|\1|')"
    echo "Puerto: $(echo $DATABASE_URL | sed -E 's|.*:([0-9]+)/.*|\1|' || echo '5432')"
    echo "Base de datos: $(echo $DATABASE_URL | sed -E 's|.*/([^?]+).*|\1|')"
    echo "Usuario: $(echo $DATABASE_URL | sed -E 's|.*://([^:]+):.*|\1|')"
    echo ""
    echo "⚠️  La contraseña está oculta por seguridad"
    echo "   Revisa tu archivo .env para obtenerla"
  fi
fi
```

### 🔐 Seguridad

- **Nunca compartas** tu archivo `.env` o las credenciales
- **Usa conexiones SSL** siempre (ya está configurado en tu DATABASE_URL)
- Considera usar **variables de entorno** en lugar de hardcodear credenciales

### 📚 Recursos Adicionales

- [Documentación de DBeaver](https://dbeaver.com/docs/)
- [Documentación de Neon](https://neon.tech/docs)
- [Guía de PostgreSQL SSL](https://www.postgresql.org/docs/current/ssl-tcp.html)

