/**
 * Мінімальний XML-парсер для GPX і KML (без зовнішніх залежностей).
 * Підтримує елементи, атрибути, текст, CDATA, коментарі та інструкції обробки.
 * DTD і зовнішні сутності не обробляються (захист від XXE).
 */
export interface XmlNode {
  name: string; // локальне ім'я без префікса простору імен
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
}

const localName = (n: string) => n.slice(n.indexOf(':') + 1);

export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: '#root', attrs: {}, children: [], text: '' };
  const stack: XmlNode[] = [root];
  let i = 0;
  const len = xml.length;
  while (i < len) {
    const lt = xml.indexOf('<', i);
    const textEnd = lt === -1 ? len : lt;
    if (textEnd > i) stack[stack.length - 1].text += decodeEntities(xml.slice(i, textEnd));
    if (lt === -1) break;
    if (xml.startsWith('<!--', lt)) { i = end(xml, '-->', lt) + 3; continue; }
    if (xml.startsWith('<![CDATA[', lt)) { const e = end(xml, ']]>', lt); stack[stack.length - 1].text += xml.slice(lt + 9, e); i = e + 3; continue; }
    if (xml.startsWith('<?', lt)) { i = end(xml, '?>', lt) + 2; continue; }
    if (xml.startsWith('<!', lt)) throw new Error('DTD не підтримується');
    const gt = end(xml, '>', lt);
    const raw = xml.slice(lt + 1, gt);
    i = gt + 1;
    if (raw.startsWith('/')) {
      const name = localName(raw.slice(1).trim());
      const top = stack.pop();
      if (!top || top.name !== name || stack.length === 0) throw new Error(`Неочікуваний закриваючий тег </${name}>`);
      continue;
    }
    const selfClosing = raw.endsWith('/');
    const body = selfClosing ? raw.slice(0, -1) : raw;
    const nameMatch = /^\s*([^\s/>]+)/.exec(body);
    if (!nameMatch) throw new Error('Некоректний тег');
    const node: XmlNode = { name: localName(nameMatch[1]), attrs: {}, children: [], text: '' };
    const attrRe = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let m: RegExpExecArray | null;
    while ((m = attrRe.exec(body.slice(nameMatch[0].length)))) node.attrs[localName(m[1])] = decodeEntities(m[3] ?? m[4] ?? '');
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }
  if (stack.length !== 1) throw new Error(`Не закрито тег <${stack[stack.length - 1].name}>`);
  if (root.children.length !== 1) throw new Error('Документ повинен мати один кореневий елемент');
  return root.children[0];
}

function end(xml: string, token: string, from: number): number {
  const idx = xml.indexOf(token, from);
  if (idx === -1) throw new Error('Неочікуваний кінець документа');
  return idx;
}

/** Усі нащадки з заданим ім'ям (пошук у глибину). */
export function findAll(node: XmlNode, name: string, acc: XmlNode[] = []): XmlNode[] {
  for (const c of node.children) {
    if (c.name === name) acc.push(c);
    findAll(c, name, acc);
  }
  return acc;
}

export function child(node: XmlNode, name: string): XmlNode | undefined {
  return node.children.find((c) => c.name === name);
}

export function childText(node: XmlNode, name: string): string {
  return (child(node, name)?.text ?? '').trim();
}
