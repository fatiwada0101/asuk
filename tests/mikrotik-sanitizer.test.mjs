import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeMikroTikConfig, isPrivateIp } from '../lib/mikrotik.js';

test('sanitizeMikroTikConfig - strips http:// and sets use_ssl to false if not specified', () => {
  const result = sanitizeMikroTikConfig({
    ip: 'http://hgn09g0fv3t.sn.mynetname.net',
  });
  assert.equal(result.ip, 'hgn09g0fv3t.sn.mynetname.net');
  assert.equal(result.port, '80');
  assert.equal(result.use_ssl, false);
  assert.equal(result.protocol, 'http');
  assert.equal(result.isConfigured, true);
});

test('sanitizeMikroTikConfig - strips https:// and trailing slashes', () => {
  const result = sanitizeMikroTikConfig({
    ip: 'https://hgn09g0fv3t.sn.mynetname.net/',
  });
  assert.equal(result.ip, 'hgn09g0fv3t.sn.mynetname.net');
  assert.equal(result.port, '443');
  assert.equal(result.use_ssl, true);
  assert.equal(result.protocol, 'https');
  assert.equal(result.isConfigured, true);
});

test('sanitizeMikroTikConfig - extracts embedded port from host string', () => {
  const result = sanitizeMikroTikConfig({
    ip: 'hgn09g0fv3t.sn.mynetname.net:8443/',
  });
  assert.equal(result.ip, 'hgn09g0fv3t.sn.mynetname.net');
  assert.equal(result.port, '8443');
  assert.equal(result.use_ssl, true);
  assert.equal(result.protocol, 'https');
  assert.equal(result.isConfigured, true);
});

test('sanitizeMikroTikConfig - handles http://host:443 scenario gracefully', () => {
  const result = sanitizeMikroTikConfig({
    ip: 'http://hgn09g0fv3t.sn.mynetname.net:443',
    use_ssl: true,
  });
  assert.equal(result.ip, 'hgn09g0fv3t.sn.mynetname.net');
  assert.equal(result.port, '443');
  assert.equal(result.use_ssl, true);
  assert.equal(result.protocol, 'https');
  assert.equal(result.isConfigured, true);
});

test('sanitizeMikroTikConfig - identifies default unconfigured router', () => {
  const result = sanitizeMikroTikConfig({
    ip: '192.168.88.1',
    pass: '',
  });
  assert.equal(result.ip, '192.168.88.1');
  assert.equal(result.isConfigured, false);
});

test('sanitizeMikroTikConfig - identifies configured default router when password exists', () => {
  const result = sanitizeMikroTikConfig({
    ip: '192.168.88.1',
    pass: 'secret123',
  });
  assert.equal(result.isConfigured, true);
});

test('isPrivateIp - correctly identifies private and public addresses', () => {
  assert.equal(isPrivateIp('192.168.88.1'), true);
  assert.equal(isPrivateIp('10.0.0.1'), true);
  assert.equal(isPrivateIp('172.16.0.1'), true);
  assert.equal(isPrivateIp('localhost'), true);
  assert.equal(isPrivateIp('127.0.0.1'), true);
  assert.equal(isPrivateIp('102.91.97.118'), false);
  assert.equal(isPrivateIp('hgn09g0fv3t.sn.mynetname.net'), false);
});
