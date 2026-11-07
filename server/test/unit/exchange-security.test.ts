import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CodecRegistry, ExportableRoute, GeoJsonCodec, GpxCodec, KmlCodec } from '../../src/application/exchange/codecs';
import { parseXml } from '../../src/application/exchange/xml';
import { sample } from '../../src/application/exchange.service';
import { ValidationError, AuthError } from '../../src/domain/shared/errors';
import { HmacTokenService, ScryptPasswordHasher } from '../../src/infrastructure/security';
import { InMemoryEventBus } from '../../src/infrastructure/event-bus';

const route: ExportableRoute = {
  title: 'Замки & фортеці <Поділля>',
  description: 'Маршрут "вихідного дня"',
  waypoints: [{ lat: 49.0, lon: 25.0 }, { lat: 49.1, lon: 25.1 }, { lat: 49.2, lon: 25.15 }],
  pois: [{ name: 'Замок', description: 'XIV ст.', category: 'HISTORY', location: { lat: 49.1, lon: 25.1 } }],
};

describe('Кодеки форматів (патерн «Стратегія»)', () => {
  for (const codec of [new GpxCodec(), new KmlCodec(), new GeoJsonCodec()]) {
    it(`${codec.format}: експорт і повторний імпорт зберігають дані`, () => {
      const back = codec.decode(codec.encode(route));
      assert.equal(back.title, route.title);
      assert.equal(back.description, route.description);
      assert.deepEqual(back.waypoints, route.waypoints);
      assert.equal(back.pois.length, 1);
      assert.equal(back.pois[0].name, 'Замок');
      assert.deepEqual({ lat: back.pois[0].lat, lon: back.pois[0].lon }, route.pois[0].location);
    });
  }

  it('GPX: читає точки маршруту rtept, якщо трек відсутній', () => {
    const gpx = `<?xml version="1.0"?><gpx version="1.1"><rte><name>Rte</name><rtept lat="1" lon="2"/><rtept lat="3" lon="4"/></rte></gpx>`;
    const r = new GpxCodec().decode(gpx);
    assert.equal(r.title, 'Rte');
    assert.deepEqual(r.waypoints, [{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }]);
  });

  it('GPX з префіксом простору імен, коментарями та CDATA', () => {
    const gpx = `<g:gpx xmlns:g="x"><!-- c --><g:metadata><g:name><![CDATA[Назва <1>]]></g:name></g:metadata>
      <g:trk><g:trkseg><g:trkpt lat="49.5" lon="25.5"><g:ele>300</g:ele></g:trkpt><g:trkpt lat='49.6' lon='25.6'/></g:trkseg></g:trk></g:gpx>`;
    const r = new GpxCodec().decode(gpx);
    assert.equal(r.title, 'Назва <1>');
    assert.equal(r.waypoints.length, 2);
  });

  it('некоректні файли відхиляються з ValidationError', () => {
    assert.throws(() => new GpxCodec().decode('<gpx><trk>'), ValidationError);
    assert.throws(() => new GpxCodec().decode('<kml></kml>'), ValidationError);
    assert.throws(() => new GpxCodec().decode('<gpx><trkpt lat="abc" lon="1"/></gpx>'), ValidationError);
    assert.throws(() => new KmlCodec().decode('<gpx/>'), ValidationError);
    assert.throws(() => new GeoJsonCodec().decode('{bad json'), ValidationError);
    assert.throws(() => new GeoJsonCodec().decode('{"type":"FeatureCollection","features":[]}'), ValidationError);
  });

  it('XML-парсер відхиляє DTD (захист від XXE) і декодує сутності', () => {
    assert.throws(() => parseXml('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>'), /DTD/);
    assert.equal(parseXml('<a>&lt;b&gt; &amp; &#1043;&#x0456;</a>').text, '<b> & Гі');
  });

  it('реєстр обирає кодек за розширенням файлу та назвою формату', () => {
    const reg = CodecRegistry.default();
    assert.equal(reg.detect('Track.GPX').format, 'gpx');
    assert.equal(reg.detect('a.kml').format, 'kml');
    assert.equal(reg.detect('a.geojson').format, 'geojson');
    assert.equal(reg.get('KML').format, 'kml');
    assert.throws(() => reg.detect('a.txt'), ValidationError);
    assert.throws(() => reg.get('shp'), ValidationError);
    assert.deepEqual(reg.formats(), ['gpx', 'kml', 'geojson']);
  });

  it('проріджування зберігає перший і останній елементи', () => {
    const arr = Array.from({ length: 101 }, (_, i) => i);
    const s = sample(arr, 11);
    assert.equal(s.length, 11);
    assert.equal(s[0], 0);
    assert.equal(s[10], 100);
    assert.equal(sample([1, 2], 5).length, 2);
  });
});

describe('Безпека', () => {
  const clock = { t: new Date('2026-11-01T00:00:00Z'), now() { return this.t; } };

  it('хеш пароля перевіряється, а сіль робить хеші різними', () => {
    const h = new ScryptPasswordHasher(1024);
    const a = h.hash('Secret123'), b = h.hash('Secret123');
    assert.notEqual(a, b);
    assert.equal(h.verify('Secret123', a), true);
    assert.equal(h.verify('secret123', a), false);
    assert.equal(h.verify('Secret123', 'bad-format'), false);
  });

  it('токен підписується, перевіряється і має строк дії', () => {
    const t = new HmacTokenService('test-secret-0123456789', clock, 60);
    const token = t.sign('user-1', 'USER');
    assert.equal(t.verify(token).sub, 'user-1');
    const tampered = token.slice(0, -2) + (token.endsWith('A') ? 'BB' : 'AA');
    assert.throws(() => t.verify(tampered), AuthError);
    assert.throws(() => new HmacTokenService('another-secret-0123456', clock).verify(token), AuthError);
    assert.throws(() => t.verify('abc'), AuthError);
    clock.t = new Date(clock.t.getTime() + 61_000);
    assert.throws(() => t.verify(token), /Строк дії/);
  });

  it('короткий секрет відхиляється', () => {
    assert.throws(() => new HmacTokenService('short', clock));
  });
});

describe('Шина подій (патерн «Спостерігач»)', () => {
  it('доставляє події підписникам і ізолює помилки', () => {
    const errors: unknown[] = [];
    const bus = new InMemoryEventBus((e) => errors.push(e));
    const got: string[] = [];
    bus.subscribe('UserRoleChanged', () => { throw new Error('збій'); });
    const off = bus.subscribe('UserRoleChanged', (e) => got.push(e.role));
    bus.publish({ type: 'UserRoleChanged', userId: 'u', role: 'ADMIN' });
    off();
    bus.publish({ type: 'UserRoleChanged', userId: 'u', role: 'USER' });
    assert.deepEqual(got, ['ADMIN']);
    assert.equal(errors.length, 2);
  });
});
