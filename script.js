const CSV_PATH = 'profesores.csv';
const BG_PATH = 'certificado-fondo.jpg';

let profesores = [];
let seleccionado = null;
let fondoImg = null;
let qrCache = new Map();

const $ = (id) => document.getElementById(id);
const searchInput = $('searchInput');
const btnBuscar = $('btnBuscar');
const estado = $('estado');
const resultados = $('resultados');
const previewSection = $('previewSection');
const previewNombre = $('previewNombre');
const previewCargo = $('previewCargo');
const previewQR = $('previewQR');
const datosSeleccionados = $('datosSeleccionados');
const btnDescargar = $('btnDescargar');

function limpiarTexto(valor) {
  return String(valor ?? '').trim().replace(/\s+/g, ' ');
}

function normalizarCarnet(valor) {
  return limpiarTexto(valor).replace(/\D/g, '').replace(/^0+/, '');
}

function normalizarNombre(valor) {
  return limpiarTexto(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function numero(valor) {
  const n = parseInt(String(valor ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function datosCompletos(p) {
  const campos = ['carnet','nombre_completo','unidad_educativa','cargo','item','horas','categoria'];
  return campos.reduce((acc, c) => acc + (limpiarTexto(p[c]) ? 1 : 0), 0);
}

function compararMejor(a, b) {
  const horasA = numero(a.horas);
  const horasB = numero(b.horas);
  if (horasB !== horasA) return horasB - horasA;
  const compB = datosCompletos(b);
  const compA = datosCompletos(a);
  if (compB !== compA) return compB - compA;
  return 0;
}

function prepararRegistro(row) {
  const nombre = limpiarTexto(row.nombre_completo || `${row.nombres || ''} ${row.paterno || ''} ${row.materno || ''}`);
  return {
    ...row,
    carnet: limpiarTexto(row.carnet),
    nombre_completo: nombre.toUpperCase(),
    unidad_educativa: limpiarTexto(row.unidad_educativa).toUpperCase(),
    cargo: limpiarTexto(row.cargo).toUpperCase(),
    item: limpiarTexto(row.item),
    horas: limpiarTexto(row.horas),
    categoria: limpiarTexto(row.categoria)
  };
}

function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], cur = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      row.push(cur); cur = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cur); cur = '';
      if (row.some(v => v !== '')) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some(v => v !== '')) rows.push(row);
  if (!rows.length) return [];
  const headers = rows.shift().map(h => limpiarTexto(h));
  return rows.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}

function cargarImagen(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function cargarDatos() {
  try {
    const [csvText, bg] = await Promise.all([
      fetch(CSV_PATH).then(r => {
        if (!r.ok) throw new Error('No se pudo cargar el CSV');
        return r.text();
      }),
      cargarImagen(BG_PATH)
    ]);
    fondoImg = bg;
    profesores = parseCSV(csvText).map(prepararRegistro).filter(p => p.carnet || p.nombre_completo);
    estado.textContent = `Base de datos cargada: ${profesores.length} registros.`;
  } catch (error) {
    console.error(error);
    estado.textContent = 'No se pudo cargar la base. Abra el proyecto con Live Server en Visual Studio Code.';
  }
}

function buscar() {
  const q = limpiarTexto(searchInput.value);
  resultados.innerHTML = '';
  previewSection.classList.add('oculto');
  seleccionado = null;

  if (!q) { estado.textContent = 'Ingrese un carnet o un nombre.'; return; }
  const qCarnet = normalizarCarnet(q);
  let encontrados = [];

  if (/^\d+$/.test(q.replace(/\s/g, ''))) {
    encontrados = profesores.filter(p => normalizarCarnet(p.carnet) === qCarnet);
    if (encontrados.length > 1) encontrados = [encontrados.sort(compararMejor)[0]];
  } else {
    if (q.length < 3) { estado.textContent = 'Para buscar por nombre escriba mínimo 3 letras.'; return; }
    const qNombre = normalizarNombre(q);
    encontrados = profesores.filter(p => normalizarNombre(p.nombre_completo).includes(qNombre));
    const porCarnet = new Map();
    encontrados.forEach(p => {
      const key = normalizarCarnet(p.carnet) || p.nombre_completo;
      const actual = porCarnet.get(key);
      if (!actual || compararMejor(actual, p) > 0) porCarnet.set(key, p);
    });
    encontrados = Array.from(porCarnet.values()).sort((a,b) => a.nombre_completo.localeCompare(b.nombre_completo));
  }

  if (!encontrados.length) { estado.textContent = 'No se encontró ningún registro.'; return; }
  estado.textContent = encontrados.length === 1 ? 'Se encontró 1 registro.' : `Se encontraron ${encontrados.length} coincidencias. Seleccione una.`;
  encontrados.slice(0, 50).forEach(p => agregarResultado(p));
  if (encontrados.length === 1) seleccionar(encontrados[0]);
}

function agregarResultado(p) {
  const div = document.createElement('div');
  div.className = 'resultado-card';
  div.innerHTML = `
    <strong>${p.nombre_completo || 'SIN NOMBRE'}</strong>
    <span>Carnet: ${p.carnet || '-'}</span>
    <span>Cargo: ${p.cargo || '-'}</span>
    <span>Unidad Educativa: ${p.unidad_educativa || '-'}</span>`;
  div.addEventListener('click', () => seleccionar(p));
  resultados.appendChild(div);
}

function textoQR(p) {
  return [
    'CERTIFICADO',
    `Carnet: ${p.carnet || ''}`,
    `Nombre: ${p.nombre_completo || ''}`,
    `Unidad Educativa: ${p.unidad_educativa || ''}`,
    `Cargo: ${p.cargo || ''}`,
    `Item: ${p.item || ''}`,
    `Horas: ${p.horas || ''}`,
    `Categoría: ${p.categoria || ''}`
  ].join('\n');
}

function crearQRCanvas(texto, size = 420) {
  if (typeof QRCodeAuto === 'undefined') {
    throw new Error('No se cargó la librería local de QR. Verifique qrcode-bundle.js');
  }

  // QR local automático: se genera primero como canvas y recién después se inserta al PDF.
  // No depende de internet ni de imágenes QR pre-generadas, por eso soporta futuros cambios del CSV.
  const qrcode = new QRCodeAuto(-1, 1); // -1 = versión automática, 1 = corrección L con mayor capacidad.
  qrcode.addData(texto);
  qrcode.make();

  const moduleCount = qrcode.getModuleCount();
  const quiet = 4;
  const cell = Math.floor(size / (moduleCount + quiet * 2));
  const realSize = cell * (moduleCount + quiet * 2);

  const canvas = document.createElement('canvas');
  canvas.width = realSize;
  canvas.height = realSize;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, realSize, realSize);
  ctx.fillStyle = '#000000';

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qrcode.isDark(row, col)) {
        ctx.fillRect((col + quiet) * cell, (row + quiet) * cell, cell, cell);
      }
    }
  }

  return canvas;
}

function crearQRDataURL(p) {
  const key = `${p.carnet}|${p.item}|${p.unidad_educativa}|${p.cargo}|${p.horas}|${p.categoria}`;
  if (qrCache.has(key)) return qrCache.get(key);
  const canvas = crearQRCanvas(textoQR(p), 460);
  const dataURL = canvas.toDataURL('image/png');
  qrCache.set(key, dataURL);
  return dataURL;
}

function cargarImagenDesdeDataURL(dataURL) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataURL;
  });
}

async function seleccionar(p) {
  seleccionado = p;
  previewNombre.textContent = p.nombre_completo || '';
  previewCargo.textContent = p.cargo || '';
  datosSeleccionados.textContent = `Carnet: ${p.carnet || '-'} | Unidad Educativa: ${p.unidad_educativa || '-'} | Horas: ${p.horas || '-'}`;
  try {
    previewQR.src = crearQRDataURL(p);
  } catch (error) {
    console.error('Error al generar QR de vista previa:', error);
    previewQR.removeAttribute('src');
  }
  previewSection.classList.remove('oculto');
  previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function ajustarFuente(ctx, text, fontBase, maxWidth, startPx, minPx) {
  let size = startPx;
  while (size > minPx) {
    ctx.font = `bold ${size}px ${fontBase}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 1;
  }
  return size;
}

function escribirCentrado(ctx, text, x, y, maxWidth, fontBase, startPx, minPx, bold = true) {
  const weight = bold ? 'bold' : 'normal';
  let size = startPx;
  while (size > minPx) {
    ctx.font = `${weight} ${size}px ${fontBase}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 1;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.font = `${weight} ${size}px ${fontBase}`;
  ctx.fillText(text, x, y, maxWidth);
}

function nombreArchivo(p) {
  const carnet = (p.carnet || 'sin_carnet').replace(/[^0-9A-Za-z_-]/g, '');
  const nombre = (p.nombre_completo || 'certificado')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^0-9A-Za-z]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `certificado_${carnet}_${nombre}.pdf`;
}

function dataURLToBytes(dataURL) {
  const base64 = dataURL.split(',')[1];
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function asciiBytes(str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
  return bytes;
}

function concatBytes(parts) {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
}

function crearPDFConImagen(jpegBytes, imgW, imgH, filename) {
  const pageW = 612, pageH = 792;
  const parts = [];
  const offsets = [0];
  let pos = 0;
  function add(part) { parts.push(part); pos += part.length; }
  function addObj(n, content) { offsets[n] = pos; add(asciiBytes(`${n} 0 obj\n${content}\nendobj\n`)); }

  add(asciiBytes('%PDF-1.3\n%\xE2\xE3\xCF\xD3\n'));
  addObj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  addObj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  addObj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im1 5 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 4 0 R >>`);
  const stream = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im1 Do\nQ\n`;
  addObj(4, `<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
  offsets[5] = pos;
  add(asciiBytes(`5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`));
  add(jpegBytes);
  add(asciiBytes('\nendstream\nendobj\n'));
  const xrefPos = pos;
  add(asciiBytes(`xref\n0 6\n0000000000 65535 f \n`));
  for (let i = 1; i <= 5; i++) add(asciiBytes(String(offsets[i]).padStart(10, '0') + ' 00000 n \n'));
  add(asciiBytes(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`));
  const pdfBytes = concatBytes(parts);
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function descargarPDF() {
  if (!seleccionado) return;
  btnDescargar.disabled = true;
  const textoOriginalBoton = btnDescargar.textContent;
  btnDescargar.textContent = 'Generando PDF...';

  try {
    if (!fondoImg) fondoImg = await cargarImagen(BG_PATH);
    const qrDataURL = crearQRDataURL(seleccionado);
    const qrImg = await cargarImagenDesdeDataURL(qrDataURL);

    const canvas = document.createElement('canvas');
    canvas.width = fondoImg.naturalWidth || 1187;
    canvas.height = fondoImg.naturalHeight || 1536;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(fondoImg, 0, 0, canvas.width, canvas.height);

    const W = canvas.width, H = canvas.height;
    const fontBase = "Georgia, 'Times New Roman', serif";

    escribirCentrado(ctx, seleccionado.nombre_completo || '', W * 0.56, H * 0.423, W * 0.64, fontBase, 38, 24, true);
    // Cargo ubicado claramente debajo de la línea y encima del texto inferior, evitando quedar tachado.
    escribirCentrado(ctx, seleccionado.cargo || '', W * 0.56, H * 0.472, W * 0.58, fontBase, 19, 13, false);

    // QR obligatorio en la parte inferior derecha: 20% más grande, más abajo y casi al extremo.
    // Se deja una base blanca para que cualquier celular lo lea bien y para no mezclarse con el fondo.
    const qrSize = Math.round(W * 0.246);
    const pad = Math.round(W * 0.012);
    const marginRight = Math.round(W * 0.022);
    const marginBottom = Math.round(H * 0.016);
    const qrX = W - qrSize - marginRight;
    const qrY = H - qrSize - marginBottom;
    ctx.fillStyle = '#fff';
    ctx.fillRect(qrX - pad, qrY - pad, qrSize + pad * 2, qrSize + pad * 2);
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

    const jpegData = canvas.toDataURL('image/jpeg', 0.95);
    const jpegBytes = dataURLToBytes(jpegData);
    crearPDFConImagen(jpegBytes, W, H, nombreArchivo(seleccionado));
  } catch (error) {
    console.error('Error al generar PDF:', error);
    alert('No se pudo generar el PDF. Abra el proyecto con Live Server y verifique que qrcode-bundle.js esté presente.');
  } finally {
    btnDescargar.disabled = false;
    btnDescargar.textContent = textoOriginalBoton;
  }
}

btnBuscar.addEventListener('click', buscar);
searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') buscar(); });
searchInput.addEventListener('input', () => {
  const q = limpiarTexto(searchInput.value);
  if (q && !/^\d+$/.test(q) && q.length >= 3) buscar();
});
btnDescargar.addEventListener('click', descargarPDF);

cargarDatos();
