import PDFDocument from 'pdfkit';

export interface PdfAuditEvent { id: string; eventType: string; trigger: string | null; verdict: string | null; reasonCode: string | null; occurredAt: Date; intentId: string | null }

export async function auditPdf(args: { asOf: Date; chain: string; events: PdfAuditEvent[] }): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: 'Certus Point-in-Time Audit Report' } });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const complete = new Promise<Buffer>((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
  doc.rect(0, 0, 595, 110).fill('#111827');
  doc.fillColor('#FFFFFF').fontSize(23).font('Helvetica-Bold').text('CERTUS', 48, 38);
  doc.fontSize(11).font('Helvetica').fillColor('#C7D2FE').text('Point-in-time compliance audit', 48, 72);
  doc.fillColor('#111827').fontSize(10).text(`Network: ${args.chain}`, 48, 135).text(`As of: ${args.asOf.toISOString()}`, 48, 152).text(`Events: ${args.events.length}`, 48, 169);
  doc.moveTo(48, 193).lineTo(547, 193).strokeColor('#E5E7EB').stroke();
  let y = 215;
  for (const event of args.events) {
    if (y > 735) { doc.addPage(); y = 54; }
    const color = event.verdict === 'PASS' ? '#047857' : event.verdict === 'FREEZE' ? '#B91C1C' : '#92400E';
    doc.roundedRect(48, y, 499, 58, 6).fillAndStroke('#F9FAFB', '#E5E7EB');
    doc.fillColor(color).font('Helvetica-Bold').fontSize(9).text(event.verdict ?? 'RECORDED', 62, y + 12, { width: 70 });
    doc.fillColor('#111827').fontSize(10).text(`${event.eventType} / ${event.trigger ?? 'SYSTEM'}`, 140, y + 11, { width: 250 });
    doc.fillColor('#6B7280').font('Helvetica').fontSize(8).text(event.reasonCode ?? 'No refusal reason', 140, y + 29, { width: 250 });
    doc.text(event.occurredAt.toISOString(), 397, y + 12, { width: 135, align: 'right' });
    doc.text(event.intentId ? `Intent ${event.intentId.slice(0, 14)}` : 'System', 397, y + 29, { width: 135, align: 'right' });
    y += 68;
  }
  doc.fillColor('#6B7280').fontSize(8).text('Generated from the append-only Certus audit store. No cached compliance verdict authorizes settlement.', 48, 770, { width: 499, align: 'center' });
  doc.end();
  return complete;
}
