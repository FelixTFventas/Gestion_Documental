import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer, Font } from '@react-pdf/renderer';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { consecutive, cop, dateTime, type Detail, type Decision } from './types';

Font.registerHyphenationCallback(word => word.length > 45 ? word.match(/.{1,35}/g) || [word] : [word]);
const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, color: '#16202f', paddingTop: 94, paddingBottom: 43, paddingHorizontal: 30, lineHeight: 1.4 },
  header: { position: 'absolute', top: 22, left: 30, right: 30, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1.5, borderBottomColor: '#19377c', paddingBottom: 8 },
  logo: { width: 195, height: 48, objectFit: 'contain' }, title: { fontSize: 17, color: '#19377c', fontFamily: 'Helvetica-Bold' },
  meta: { fontSize: 8, color: '#536174', textAlign: 'right' },
  row: { flexDirection: 'row', borderBottomWidth: 0.6, borderBottomColor: '#9ca7b4', minHeight: 27 },
  label: { width: 110, fontSize: 8, fontFamily: 'Helvetica-Bold', padding: 7, backgroundColor: '#f1f3f7' },
  value: { flex: 1, padding: 7 }, concept: { borderBottomWidth: 0.6, borderColor: '#9ca7b4', padding: 9, minHeight: 76 },
  small: { fontSize: 8, color: '#536174' },
  signatures: { flexDirection: 'row', paddingTop: 16 },
  approvals: { width: '62%', paddingRight: 20 }, approval: { minHeight: 40, borderBottomWidth: 0.6, borderColor: '#9ca7b4', paddingBottom: 5, marginBottom: 7 },
  received: { width: '38%', paddingLeft: 10 }, blank: { borderBottomWidth: 0.6, borderColor: '#9ca7b4', minHeight: 24, marginBottom: 12 },
  footer: { position: 'absolute', bottom: 18, left: 30, right: 30, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: '#536174' },
  draft: { padding: 6, marginBottom: 7, fontSize: 9, color: '#7a4b13', backgroundColor: '#fff4de' }
});
function Approval({ title, decision }: { title: string; decision?: Decision }) {
  return <View style={s.approval} wrap={false}><Text style={s.small}>{title}</Text><Text style={{ fontSize: 9 }}>{decision ? `${decision.actor_name} · ${dateTime(decision.created_at)}` : ' '}</Text></View>;
}
export function EgresoPDF({ detail }: { detail: Detail }) {
  const { doc, version, decisions } = detail;
  const data = version.data;
  const logo = path.join(process.cwd(), 'public', 'logo.png');
  const auth = decisions.find(d => d.kind === 'AUTHORIZE');
  const rows = [['FECHA', data.date || ''], ['PROPIETARIO', data.owner || ''], ['ARRENDATARIO', data.tenant || ''], ['PAGADO A', data.payee || ''], ['VALOR', version.amount ? `${cop(version.amount)} COP` : '']];
  return <Document title={`${consecutive(doc.number)} · Formato de egreso · v${version.number}`} author="Félix Trujillo Falla Inmobiliaria" language="es-CO">
    <Page size="A4" orientation="landscape" style={s.page} wrap>
      <View style={s.header} fixed>
        {existsSync(logo) ? <Image src={{ data: readFileSync(logo), format: 'png' }} style={s.logo} /> : <Text>Félix Trujillo Falla Inmobiliaria</Text>}
        <View><Text style={s.title}>Formato de egreso</Text><Text style={s.meta}>{consecutive(doc.number)} · Versión {version.number}</Text><Text style={s.meta}>Forma de pago: {data.payment === 'EFECTIVO' ? 'Efectivo' : data.payment === 'TRANSFERENCIA' ? 'Transferencia' : 'Sin diligenciar'}</Text></View>
      </View>
      {!version.frozen && <Text style={s.draft}>BORRADOR · Puede estar incompleto. No constituye autorización.</Text>}
      {rows.map(([label, value]) => <View key={label} style={s.row} wrap={false}><Text style={s.label}>{label}</Text><Text style={s.value}>{value || ' '}</Text></View>)}
      <View style={s.concept}><Text style={[s.small, { fontFamily: 'Helvetica-Bold', marginBottom: 5 }]}>CONCEPTO</Text><Text orphans={3} widows={3}>{data.concept || ' '}</Text></View>
      <View style={s.signatures} wrap={false}>
        <View style={s.approvals}>
          <Approval title="V.º B.º Dirección Administrativa" decision={decisions.find(d => d.kind === 'VISA' && d.area_id === 'administrativa')} />
          <Approval title="V.º B.º Contabilidad" decision={decisions.find(d => d.kind === 'VISA' && d.area_id === 'contabilidad')} />
          <Approval title="V.º B.º Gerencia General" decision={auth} />
        </View>
        <View style={s.received}><Text style={s.small}>CT N.º (referencia opcional)</Text><Text style={s.blank}>{data.ct || ' '}</Text><Text style={s.small}>RECIBE</Text><Text style={s.blank}>{data.receiver || ' '}</Text><Text style={s.small}>N.º C. C.</Text><Text style={s.blank}>{data.identity || ' '}</Text></View>
      </View>
      <View style={s.footer} fixed><Text>{auth ? 'Autorización interna registrada para esta versión. No es firma electrónica ni orden de pago.' : 'Sin autorización de Gerencia para esta versión.'}</Text><Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} /></View>
    </Page>
  </Document>;
}
export async function generatePDF(detail: Detail) { return renderToBuffer(<EgresoPDF detail={detail} />); }
