export const DEFAULT_COTACAO_FILENAME = 'cotacao_preenchida.xlsx';

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function ensureXlsxFilename(value) {
  const cleaned = String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/[. ]+$/g, '')
    .trim();
  const filename = cleaned || DEFAULT_COTACAO_FILENAME;
  return /\.xlsx$/i.test(filename) ? filename : `${filename.replace(/\.(xls|csv)$/i, '')}.xlsx`;
}

export function defaultCotacaoFilename(file) {
  const base = String(file?.name || '')
    .replace(/\.[^.]+$/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .trim();

  if (!base) return DEFAULT_COTACAO_FILENAME;
  return ensureXlsxFilename(/_preenchida$/i.test(base) ? base : `${base}_preenchida`);
}

export function criarArquivoCotacaoEncadeado(blob, filename, lastModified = Date.now()) {
  if (!(blob instanceof Blob)) {
    throw new TypeError('O resultado da cotação precisa ser um Blob.');
  }

  return new File(
    [blob],
    ensureXlsxFilename(filename),
    {
      type: blob.type || XLSX_MIME_TYPE,
      lastModified,
    }
  );
}
