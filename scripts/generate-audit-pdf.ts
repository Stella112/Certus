import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../src/lib/db';
import { auditPdf } from '../src/lib/audit/pdf';

const chain=process.argv[2]??'monad'; const asOf=new Date();
const events=await prisma.auditEvent.findMany({where:{occurredAt:{lte:asOf},intent:{chain}},orderBy:{occurredAt:'asc'}});
const pdf=await auditPdf({asOf,chain,events});
const target=path.resolve('output','pdf',`certus-audit-${chain}.pdf`);
await fs.mkdir(path.dirname(target),{recursive:true}); await fs.writeFile(target,pdf);
console.log(JSON.stringify({target,bytes:pdf.length,events:events.length}));
await prisma.$disconnect();
