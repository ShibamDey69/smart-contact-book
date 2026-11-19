/* ───────── Data structures ───────── */

// Singly linked list. Used for hash buckets (chaining) and company groups.
class LNode {
  constructor(value) { this.value = value; this.next = null; }
}

class LinkedList {
  constructor() { this.head = null; this.size = 0; }

  add(value) {                       // O(1) prepend
    const n = new LNode(value);
    n.next = this.head;
    this.head = n;
    this.size++;
  }

  find(pred) {
    for (let n = this.head; n; n = n.next) if (pred(n.value)) return n.value;
    return undefined;
  }

  remove(pred) {
    let prev = null;
    for (let n = this.head; n; prev = n, n = n.next) {
      if (!pred(n.value)) continue;
      if (prev) prev.next = n.next; else this.head = n.next;
      this.size--;
      return true;
    }
    return false;
  }

  *[Symbol.iterator]() {
    for (let n = this.head; n; n = n.next) yield n.value;
  }
}

// Hash table with separate chaining (djb2) and auto-resize.
class HashTable {
  constructor(capacity = 16) {
    this.buckets = Array.from({ length: capacity }, () => new LinkedList());
    this.size = 0;
  }

  #hash(key) {
    let h = 5381;
    for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
    return (h >>> 0) % this.buckets.length;
  }

  set(key, value) {
    const bucket = this.buckets[this.#hash(key)];
    const entry = bucket.find(e => e.key === key);
    if (entry) { entry.value = value; return; }
    bucket.add({ key, value });
    if (++this.size / this.buckets.length > 0.75) this.#resize();
  }

  get(key) {
    return this.buckets[this.#hash(key)].find(e => e.key === key)?.value;
  }

  delete(key) {
    const removed = this.buckets[this.#hash(key)].remove(e => e.key === key);
    if (removed) this.size--;
    return removed;
  }

  *entries() {
    for (const b of this.buckets) for (const e of b) yield e;
  }

  #resize() {
    const old = [...this.entries()];
    this.buckets = Array.from({ length: this.buckets.length * 2 }, () => new LinkedList());
    this.size = 0;
    for (const { key, value } of old) this.set(key, value);
  }
}

// Trie for name-prefix search. Every node keeps the ids of contacts whose
// name words pass through it, so a prefix lookup is O(len(prefix)).
class TrieNode {
  constructor() { this.children = new Map(); this.ids = new Set(); }
}

class Trie {
  constructor() { this.root = new TrieNode(); }

  insert(word, id) {
    let node = this.root;
    for (const ch of word) {
      if (!node.children.has(ch)) node.children.set(ch, new TrieNode());
      node = node.children.get(ch);
      node.ids.add(id);
    }
  }

  remove(word, id) {
    let node = this.root;
    const path = [];
    for (const ch of word) {
      const next = node.children.get(ch);
      if (!next) return;
      path.push([node, ch, next]);
      node = next;
    }
    for (let i = path.length - 1; i >= 0; i--) {
      const [parent, ch, child] = path[i];
      child.ids.delete(id);
      if (!child.ids.size && !child.children.size) parent.children.delete(ch);
    }
  }

  startsWith(prefix) {
    let node = this.root;
    for (const ch of prefix) {
      node = node.children.get(ch);
      if (!node) return new Set();
    }
    return node.ids;
  }
}

/* ───────── Contact book ───────── */

const words = s => s.toLowerCase().split(/\s+/).filter(Boolean);
const gkey = c => c.trim().toLowerCase();

class ContactBook {
  constructor() {
    this.byId = new HashTable();     // id → contact (fast retrieval)
    this.groups = new HashTable();   // company → { label, list: LinkedList }
    this.trie = new Trie();          // name words → ids
  }

  get size() { return this.byId.size; }

  add(c) {
    this.byId.set(c.id, c);
    const k = gkey(c.company);
    let g = this.groups.get(k);
    if (!g) this.groups.set(k, g = { label: c.company.trim() || "No company", list: new LinkedList() });
    g.list.add(c);
    for (const w of words(c.name)) this.trie.insert(w, c.id);
  }

  remove(id) {
    const c = this.byId.get(id);
    if (!c) return;
    this.byId.delete(id);
    const k = gkey(c.company);
    const g = this.groups.get(k);
    g.list.remove(x => x.id === id);
    if (!g.list.size) this.groups.delete(k);
    for (const w of words(c.name)) this.trie.remove(w, id);
  }

  groupList() {
    return [...this.groups.entries()]
      .map(e => ({ key: e.key, label: e.value.label, count: e.value.list.size }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  search(query, group = null) {
    const tokens = words(query);
    let out;

    if (!tokens.length) {
      out = group !== null ? [...(this.groups.get(group)?.list ?? [])] : [...this.byId.entries()].map(e => e.value);
    } else {
      // every token must prefix-match some word of the name → intersect id sets
      let ids = null;
      for (const t of tokens) {
        const hit = this.trie.startsWith(t);
        ids = ids ? new Set([...ids].filter(i => hit.has(i))) : new Set(hit);
        if (!ids.size) break;
      }
      out = [...ids].map(i => this.byId.get(i));
      if (group !== null) out = out.filter(c => gkey(c.company) === group);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }
}

/* ───────── Persistence ───────── */

const STORE = "contact-book-v1";
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const seed = [
  ["Aarav Mehta", "+91 98765 43210", "aarav@zephyr.io", "Zephyr"],
  ["Ananya Rao", "+91 91234 56780", "ananya@zephyr.io", "Zephyr"],
  ["Arjun Nair", "+91 99887 76655", "arjun@lumen.dev", "Lumen"],
  ["Priya Sharma", "+91 90909 12121", "priya@lumen.dev", "Lumen"],
  ["Priyanka Sen", "+91 88221 00987", "priyanka@northwind.com", "Northwind"],
  ["Rohan Das", "+91 70012 34567", "rohan@northwind.com", "Northwind"],
  ["Sara Khan", "+91 98300 11223", "sara@gmail.com", ""],
  ["Shibam Dey", "+91 97330 45678", "shibam@dev.in", "Lumen"],
].map(([name, phone, email, company]) => ({ id: uid(), name, phone, email, company }));

const book = new ContactBook();
let saved;
try { saved = JSON.parse(localStorage.getItem(STORE)); } catch { saved = null; }
(saved?.length ? saved : seed).forEach(c => book.add(c));

const persist = () => {
  try { localStorage.setItem(STORE, JSON.stringify(book.search("").map(c => c))); } catch {}
};

/* ───────── UI ───────── */

const $ = id => document.getElementById(id);
const q = $("q"), list = $("list"), groupsEl = $("groups"), meta = $("meta"), dlg = $("dlg"), form = $("form");
let activeGroup = null;

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

const hue = s => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
const initials = n => words(n).slice(0, 2).map(w => w[0].toUpperCase()).join("");

// Wrap the matched prefix of each name word in <mark>
function highlight(name, tokens) {
  const frag = document.createDocumentFragment();
  name.split(/(\s+)/).forEach(part => {
    const t = tokens.find(t => part.toLowerCase().startsWith(t));
    if (!t || !part.trim()) return frag.append(part);
    frag.append(el("mark", "", part.slice(0, t.length)), part.slice(t.length));
  });
  return frag;
}

function renderGroups() {
  groupsEl.replaceChildren();
  const all = book.groupList();
  if (activeGroup !== null && !book.groups.get(activeGroup)) activeGroup = null;

  const chip = (label, count, key) => {
    const b = el("button", "chip" + (activeGroup === key ? " on" : ""), label);
    b.append(el("b", "", count));
    b.onclick = () => { activeGroup = activeGroup === key ? null : key; render(); };
    groupsEl.append(b);
  };
  chip("All", book.size, null);
  all.forEach(g => chip(g.label, g.count, g.key));
}

function render() {
  renderGroups();

  const t0 = performance.now();
  const results = book.search(q.value, activeGroup);
  const ms = performance.now() - t0;
  const tokens = words(q.value);

  meta.textContent = `${results.length} of ${book.size} · ${ms.toFixed(2)} ms`;
  list.replaceChildren();

  if (!results.length) {
    list.append(el("div", "empty", tokens.length ? "No contacts match." : "Nothing here yet."));
    return;
  }

  for (const c of results) {
    const li = el("li");
    const av = el("div", "av", initials(c.name));
    av.style.background = `hsl(${hue(c.name)} 55% 50%)`;

    const info = el("div", "info");
    const name = el("div", "name");
    name.append(highlight(c.name, tokens));
    info.append(name, el("div", "sub", [c.phone, c.company, c.email].filter(Boolean).join(" · ")));

    const del = el("button", "del", "×");
    del.title = "Delete";
    del.onclick = () => { book.remove(c.id); persist(); render(); };

    li.append(av, info, del);
    list.append(li);
  }
}

q.addEventListener("input", render);

$("add").onclick = () => { form.reset(); dlg.showModal(); form.name.focus(); };
$("cancel").onclick = () => dlg.close();
dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });

form.addEventListener("submit", e => {
  e.preventDefault();
  const f = new FormData(form);
  book.add({
    id: uid(),
    name: f.get("name").trim(),
    phone: f.get("phone").trim(),
    email: f.get("email").trim(),
    company: f.get("company").trim(),
  });
  persist();
  dlg.close();
  render();
});

render();
