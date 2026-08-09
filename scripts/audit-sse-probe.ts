import { prisma } from '../src/lib/db';
const intent=await prisma.intent.findFirst({where:{chain:'monad'}});
const event=await prisma.auditEvent.create({data:{intentId:intent?.id,eventType:'CHECK_RUN',trigger:'SUBSCRIPTION_EPOCH',verdict:'PASS',checkResults:'[]',payload:'{"auditorProbe":true}'}});
console.log(event.id); await prisma.$disconnect();
