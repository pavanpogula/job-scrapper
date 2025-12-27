/**
 * @file Database schema inspector
 * @summary Shows table names, column details (type, nullable), and row counts via raw SQL
 * @tags Debug, Schema, information_schema, Raw SQL
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * @summary Queries information_schema to list tables, columns, and row counts
 */
async function inspectDatabase() {
    console.log('🔍 Inspecting Database Schema...\n');

    try {
        // 1. List all tables
        console.log('📋 Tables in public schema:');
        const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    ` as any[];

        if (tables.length === 0) {
            console.log('   (No tables found)');
        }

        for (const table of tables) {
            const tableName = table.table_name;
            if (tableName.startsWith('_')) continue; // Skip Prisma internal tables

            console.log(`\n📦 Table: ${tableName}`);

            // 2. Describe columns for each table
            const columns = await prisma.$queryRaw`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = ${tableName}
            ORDER BY ordinal_position;
        ` as any[];

            console.table(columns.map(c => ({
                Column: c.column_name,
                Type: c.data_type,
                Nullable: c.is_nullable
            })));

            // 3. Count rows
            try {
                // Unsafe query is fine here for inspection script
                const count = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as c FROM "${tableName}"`) as any[];
                console.log(`   Rows: ${Number(count[0].c)}`);
            } catch (e) { }
        }

    } catch (error) {
        console.error('Error inspecting database:', error);
    } finally {
        await prisma.$disconnect();
    }
}

inspectDatabase();
