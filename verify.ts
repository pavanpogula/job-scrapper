
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
    const companyCount = await prisma.company.count();
    const jobCount = await prisma.job.count();
    const deptCount = await prisma.department.count();

    console.log(`Companies: ${companyCount}`);
    console.log(`Jobs: ${jobCount}`);
    console.log(`Departments: ${deptCount}`);
}

check()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
