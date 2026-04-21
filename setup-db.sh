#!/bin/bash
# Setup PostgreSQL database for AdInsight

set -e

echo "🚀 Setting up AdInsight database..."

# Load environment variables if .env exists
if [ -f "./backend/.env" ]; then
  export $(cat ./backend/.env | grep -v '#' | xargs)
fi

DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-perf_marketing}
DB_USER=${DB_USER:-postgres}
DB_PASSWORD=${DB_PASSWORD:-postgres}

echo "📦 Creating database: $DB_NAME"
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -c "CREATE DATABASE $DB_NAME;" 2>/dev/null || echo "Database already exists, continuing..."

echo "📋 Running schema migrations..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f ./backend/src/db/schema.sql

echo "✅ Database setup complete!"
echo ""
echo "Demo credentials:"
echo "  Email:    admin@demo.com"
echo "  Password: admin123"
