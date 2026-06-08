import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), 'utf8'));
}

function readText(path) {
  return readFileSync(join(root, path), 'utf8');
}

function assertFilesExist(baseDir, files) {
  for (const file of files) {
    assert.equal(typeof file, 'string', `referencia invalida em ${baseDir}`);
    assert.ok(existsSync(join(root, baseDir, file)), `${baseDir}/${file} nao existe`);
  }
}

describe('extensoes Chrome', () => {
  it('manifest da extensao Cotatudo referencia arquivos existentes', () => {
    const manifest = readJson('chrome-extension/manifest.json');

    assert.equal(manifest.manifest_version, 3);
    assertFilesExist('chrome-extension', [
      manifest.background.service_worker,
      manifest.action?.default_popup || manifest.side_panel?.default_path,
      ...manifest.content_scripts.flatMap(script => script.js || []),
    ]);
    assert.ok(manifest.host_permissions.includes('https://api.venpro.com.br/*'));
    assert.match(manifest.description, /Preenchedor de cotações/);
    assert.match(manifest.description, /VR Cotação/);
    assert.match(manifest.description, /RP HUB/);
    assert.match(manifest.description, /Rede de Fornecedores/);
    assert.match(manifest.description, /Infomag Cotação/);
    assert.match(manifest.description, /Intersolid Cotação/);
    assert.match(manifest.description, /Cotação Web SMUS/);
    assert.ok(manifest.host_permissions.includes('https://infomagcotacao.com/*'));
    assert.ok(manifest.host_permissions.includes('https://*.intersolid.com.br/*'));
    assert.ok(manifest.host_permissions.includes('http://cotacaoweb.smus.com.br/*'));
    assert.ok(
      manifest.content_scripts.some(script => (script.matches || []).includes('http://179.0.124.205/*')),
      'manifest precisa carregar content script no VR Cotacao conhecido'
    );
    assert.ok(
      manifest.content_scripts.some(script => (script.matches || []).includes('https://fornecedor.rpinfo.com.br/*')),
      'manifest precisa carregar content script no RP HUB'
    );
    assert.ok(
      manifest.content_scripts.some(script => (script.matches || []).includes('https://rfd.net.br/*')),
      'manifest precisa carregar content script na Rede de Fornecedores'
    );
    assert.ok(
      manifest.content_scripts.some(script => (script.matches || []).includes('https://*.rfd.net.br/*')),
      'manifest precisa carregar content script em subdominios da Rede de Fornecedores'
    );
    assert.ok(
      manifest.content_scripts.some(script => (script.matches || []).includes('https://infomagcotacao.com/*')),
      'manifest precisa carregar content script no Infomag Cotacao'
    );
    assert.ok(
      manifest.content_scripts.some(script => (script.matches || []).includes('https://*.intersolid.com.br/*')),
      'manifest precisa carregar content script na Intersolid Cotacao'
    );
    assert.ok(
      manifest.content_scripts.some(script => (script.matches || []).includes('http://cotacaoweb.smus.com.br/*')),
      'manifest precisa carregar content script na Cotacao Web SMUS'
    );
    assert.ok(
      manifest.content_scripts.some(script => (script.matches || []).includes('https://*/fornecedores/*/cotacao/*')),
      'manifest precisa carregar content script em rotas genericas de cotacao'
    );
  });

  it('manifest da extensao WhatsApp referencia arquivos existentes', () => {
    const manifest = readJson('chrome-extension-whatsapp/manifest.json');

    assert.equal(manifest.manifest_version, 3);
    assertFilesExist('chrome-extension-whatsapp', [
      manifest.background.service_worker,
      manifest.side_panel.default_path,
      ...manifest.content_scripts.flatMap(script => script.js || []),
    ]);
    assert.ok(manifest.host_permissions.includes('https://web.whatsapp.com/*'));
    assert.ok(manifest.host_permissions.includes('https://api.venpro.com.br/*'));
  });

  it('painel WhatsApp possui os controles usados pelo JavaScript', () => {
    const html = readText('chrome-extension-whatsapp/panel.html');
    const panelJs = readText('chrome-extension-whatsapp/panel.js');
    const ids = [...panelJs.matchAll(/getElementById\('([^']+)'\)/g)].map(match => match[1]);

    for (const id of ids) {
      assert.match(html, new RegExp(`id="${id}"`), `panel.html precisa do id ${id}`);
    }
  });

  it('ZIPs publicos das extensoes existem para download no site', () => {
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.21.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.22.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.23.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.24.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.25.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.26.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.27.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.28.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-cotatudo-extension-1.0.29.zip')));
    assert.ok(existsSync(join(root, 'frontend/public/venpro-whatsapp-extension.zip')));
  });
});
