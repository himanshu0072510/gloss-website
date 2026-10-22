//#region ../src/engine.ts
const STOP = new Set(`a an the of to in on at by for with from into over under is are was were be been being and or but if then than that this these those it its he she they them his her their i you we us our your as not no so such about after before while when where who which what how why do does did done have has had will would can could should may might must more most other some any each few own same too very just also there here`.split(" "));
/** The commonest endings, trimmed off so that "running" matches "run". */
function stem(word) {
	if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
	if (word.length > 4 && word.endsWith("ing")) return word.slice(0, -3);
	if (word.length > 4 && word.endsWith("ed")) return word.slice(0, -2);
	if (word.length > 3 && word.endsWith("es")) return word.slice(0, -2);
	if (word.length > 3 && word.endsWith("s")) return word.slice(0, -1);
	return word;
}
/** The words of a piece of text, with the noise taken out. */
function tokens(text) {
	return text.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t)).map(stem);
}
const DETERMINERS = /* @__PURE__ */ new Set([
	"the",
	"a",
	"an",
	"his",
	"her",
	"their",
	"its",
	"this",
	"that",
	"these",
	"those",
	"my",
	"your",
	"our",
	"some",
	"any",
	"every",
	"each",
	"no"
]);
const PRONOUNS = /* @__PURE__ */ new Set([
	"i",
	"you",
	"he",
	"she",
	"it",
	"we",
	"they",
	"me",
	"him",
	"us",
	"them",
	"who"
]);
const COPULAS = /* @__PURE__ */ new Set([
	"is",
	"are",
	"was",
	"were",
	"be",
	"been",
	"being",
	"seems",
	"seemed",
	"looks",
	"felt",
	"became",
	"becomes"
]);
const MODALS = /* @__PURE__ */ new Set([
	"will",
	"would",
	"can",
	"could",
	"may",
	"might",
	"must",
	"shall",
	"should",
	"do",
	"does",
	"did",
	"has",
	"have",
	"had"
]);
/** Past participles that do not end in -ed, so the rule below cannot see them. */
const IRREGULAR = /* @__PURE__ */ new Set([
	"fell",
	"felt",
	"held",
	"kept",
	"left",
	"met",
	"paid",
	"said",
	"sent",
	"set",
	"shot",
	"spoken",
	"taken",
	"told",
	"wrote",
	"drawn",
	"given",
	"known",
	"seen",
	"thrown",
	"written",
	"bought",
	"brought",
	"built",
	"caught",
	"chosen",
	"done",
	"driven",
	"eaten",
	"found",
	"flown",
	"forgotten",
	"frozen",
	"grown",
	"heard",
	"hidden",
	"lost",
	"meant",
	"put",
	"read",
	"run",
	"sold",
	"spent",
	"spread",
	"stolen",
	"struck",
	"sworn",
	"taught",
	"thought",
	"understood",
	"worn",
	"won"
]);
/**
* Which part of speech a word is being used as.
*
* It matters: "the code was executed" wants the noun, "they piped the music" wants the verb,
* and the dictionary holds both. The rules are crude but they are the difference between the
* right sense and the wrong one often enough to be worth having.
*/
function guessPos(words, at) {
	return posHint(words, at).pos;
}
/**
* The part of speech the word is being used as, and how sure we are.
*
* Some rules are certain: a word after "was" is an adjective or a verb, never a noun. Some
* are only a hint: a word after "the" is usually a noun, but "a cogent case" is an adjective
* and "a perfunctory nod" is one too. A weak hint is worth something; a strong one is worth
* excluding the other meanings over.
*/
function posHint(words, at) {
	const word = words[at];
	const previous = words[at - 1];
	const next = words[at + 1];
	if (previous === "to") return {
		pos: "verb",
		strong: true
	};
	if (next && next.endsWith("ing")) return {
		pos: "verb",
		strong: true
	};
	if (word.endsWith("ing") && previous && (COPULAS.has(previous) || MODALS.has(previous))) return {
		pos: "verb",
		strong: true
	};
	if (previous && (COPULAS.has(previous) || MODALS.has(previous))) {
		if (word.endsWith("ed") || IRREGULAR.has(word)) return {
			pos: "verb",
			strong: true
		};
		if (COPULAS.has(previous)) return {
			pos: "adj",
			strong: true
		};
	}
	if (previous && IRREGULAR.has(previous)) return {
		pos: "verb",
		strong: true
	};
	if (previous && (previous.endsWith("ing") || previous.endsWith("ed"))) return {
		pos: "verb",
		strong: false
	};
	if (previous && MODALS.has(previous)) return {
		pos: "verb",
		strong: true
	};
	if (previous && PRONOUNS.has(previous) && (word.endsWith("ed") || word.endsWith("ing")) && !DETERMINERS.has(word)) return {
		pos: "verb",
		strong: true
	};
	if (next === "to" && word.endsWith("s") && !DETERMINERS.has(word) && !(previous && DETERMINERS.has(previous))) return {
		pos: "verb",
		strong: true
	};
	if (previous && DETERMINERS.has(previous)) return {
		pos: "noun",
		strong: false
	};
	return {
		pos: null,
		strong: false
	};
}
/**
* A weighted bag of words.
*
* A word that appears in half of the dictionary's examples says nothing; a word that appears
* in two of them says a great deal. That is what the document frequency is for.
*/
function vectorise(terms, df, total) {
	const counts = /* @__PURE__ */ new Map();
	for (const term of terms) counts.set(term, (counts.get(term) || 0) + 1);
	const vector = /* @__PURE__ */ new Map();
	let norm = 0;
	for (const [term, count] of counts) {
		const weight = (1 + Math.log(count)) * Math.log(1 + total / (1 + (df[term] || 0)));
		vector.set(term, weight);
		norm += weight * weight;
	}
	norm = Math.sqrt(norm) || 1;
	for (const [term, weight] of vector) vector.set(term, weight / norm);
	return vector;
}
/** How alike two bags of words are. */
function cosine(a, b) {
	let sum = 0;
	for (const [term, weight] of a) {
		const other = b.get(term);
		if (other) sum += weight * other;
	}
	return sum;
}
/** The dictionary holds lemmas: "release", not "released". */
function lemmas(word) {
	const w = word.toLowerCase();
	const tries = [w];
	if (w.endsWith("ied") && w.length > 4) tries.push(w.slice(0, -3) + "y");
	if (w.endsWith("ed") && w.length > 3) tries.push(w.slice(0, -2), w.slice(0, -1));
	if (w.endsWith("ing") && w.length > 4) tries.push(w.slice(0, -3), w.slice(0, -3) + "e");
	if (w.endsWith("es") && w.length > 3) tries.push(w.slice(0, -2), w.slice(0, -1));
	if (w.endsWith("s") && w.length > 2) tries.push(w.slice(0, -1));
	return tries;
}
/** The senses of a word, whatever form the word is in. */
function sensesOf(dictionary, word) {
	for (const candidate of lemmas(word)) {
		const senses = dictionary[candidate];
		if (senses && senses.length) return senses;
	}
	return [];
}
/**
* The meanings of a word, best fit for this sentence first.
*
* The commonest meaning is kept at the top of the list even when the sentence says little,
* because for a word the reader has never seen, the commonest meaning is usually the one they
* meant.
*/
function disambiguate(dictionary, df, total, word, sentence, cues) {
	const senses = sensesOf(dictionary, word);
	if (!senses.length) return [];
	const words = sentence.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
	const at = words.findIndex((w) => w === word.toLowerCase());
	const hint = at >= 0 ? posHint(words, at) : {
		pos: null,
		strong: false
	};
	const wantedPos = hint.pos;
	const target = stem(word.toLowerCase());
	const withoutTarget = (terms) => terms.filter((t) => t !== target);
	const sentenceVector = vectorise(withoutTarget(tokens(sentence)), df, total);
	const notes = [];
	if (cues) {
		const list = cues[word.toLowerCase()];
		if (list) {
			const lower = sentence.toLowerCase();
			const words = new Set(withoutTarget(tokens(sentence)));
			const raw = new Set(lower.replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean));
			for (const cue of list) if (cue.when.some((when) => when.includes(" ") ? lower.includes(when) : words.has(stem(when)) || raw.has(when))) notes.push(cue);
		}
	}
	const posMatches = wantedPos ? senses.filter((sense) => sensePosOf(sense) === wantedPos) : [];
	const candidates = hint.strong && posMatches.length ? posMatches : senses;
	const scored = candidates.map((sense, index) => {
		const examples = vectorise(withoutTarget(tokens(sense.e.join(" "))), df, total);
		const definition = vectorise(withoutTarget(tokens(sense.d)), df, total);
		let score = cosine(sentenceVector, examples) * .75 + cosine(sentenceVector, definition) * .25;
		if (!sense.e.length) score *= .6;
		if (wantedPos) {
			const sensePos = sensePosOf(sense);
			if (sensePos) {
				if (hint.strong) score *= sensePos === wantedPos ? 1.8 : .4;
				else score *= sensePos === wantedPos ? 1.15 : 1;
			}
		}
		if (notes.length) {
			if (notes.some((note) => sense.d.toLowerCase().includes(note.sense.toLowerCase()))) score *= 3;
			else score *= .75;
		}
		return {
			sense,
			index,
			score
		};
	});
	scored.sort((a, b) => b.score - a.score);
	if (notes.length) {
		const noted = scored.filter((entry) => notes.some((note) => entry.sense.d.toLowerCase().includes(note.sense.toLowerCase())));
		if (noted.length) {
			const best = noted[0];
			best.score = Math.max(best.score, .06);
			scored.splice(scored.indexOf(best), 1);
			scored.unshift(best);
		}
	}
	if (scored.length && scored[0].score < .05) {
		const pool = wantedPos ? candidates.filter((s) => sensePosOf(s) === wantedPos) : [];
		const noted = pool.filter((s) => notes.some((note) => s.d.toLowerCase().includes(note.sense.toLowerCase())));
		const fallback = noted.length ? noted[0] : pool.length ? pool[0] : candidates[0];
		const chosen = scored.find((s) => s.index === candidates.indexOf(fallback));
		const rest = scored.filter((s) => s !== chosen);
		return [{
			...chosen.sense,
			score: .05
		}, ...rest.map((s) => ({
			...s.sense,
			score: s.score
		}))];
	}
	return scored.map((s, index) => ({
		...s.sense,
		score: s.score + .08 / (1 + index)
	}));
}
const sensePosCache = /* @__PURE__ */ new WeakMap();
/** The part of speech a sense is used in. */
function sensePosOf(sense) {
	const cached = sensePosCache.get(sense);
	if (cached !== void 0) return cached;
	if (sense.p === "noun" || sense.p === "verb" || sense.p === "adj" || sense.p === "adv") {
		sensePosCache.set(sense, sense.p);
		return sense.p;
	}
	const counts = {
		verb: 0,
		noun: 0,
		adj: 0,
		adv: 0
	};
	for (const example of sense.e) {
		const words = example.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
		for (let i = 0; i < words.length; i++) {
			const pos = guessPos(words, i);
			if (pos) counts[pos]++;
		}
	}
	let best = null;
	let bestCount = 0;
	for (const [pos, count] of Object.entries(counts)) if (count > bestCount) {
		best = pos;
		bestCount = count;
	}
	sensePosCache.set(sense, best);
	return best;
}
//#endregion
//#region src/demo.ts
const dictionary = await (await fetch("./data/wordnet.json")).json();
const df = await (await fetch("./data/df.json")).json();
const cues = await (await fetch("./data/cues.json")).json();
/** every English word — fetched only when a lookup has failed */
let wordList = null;
const loadWords = async () => {
	if (!wordList) try {
		const text = await (await fetch("./data/words.txt")).text();
		wordList = new Set(text.split("\n").map((w) => w.trim()).filter(Boolean));
	} catch {
		wordList = /* @__PURE__ */ new Set();
	}
	return wordList;
};
const total = Object.keys(dictionary).length;
document.getElementById("sample");
const panelEl = document.getElementById("panel");
const STYLE = `
.panel {
  position: fixed;
  z-index: 20;
  width: 340px;
  background: rgba(255, 255, 255, 0.98);
  color: #14161b;
  font: 14px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  border-radius: 13px;
  border: 1px solid rgba(16, 20, 28, 0.1);
  box-shadow: 0 1px 2px rgba(16, 20, 28, 0.06), 0 14px 38px rgba(16, 20, 28, 0.16);
  overflow: hidden;
  animation: gloss-in 140ms cubic-bezier(0.22, 1, 0.36, 1);
}
@keyframes gloss-in {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
.head { display: flex; align-items: baseline; gap: 8px; padding: 12px 15px 8px; }
.word { font-size: 17px; font-weight: 620; letter-spacing: -0.012em; }
.pos {
  font-size: 11px; color: #6a6f7b; background: #f1f3f7; border: 1px solid #e7eaf0;
  padding: 1.5px 7px; border-radius: 6px;
}
.close { margin-left: auto; border: 0; background: none; color: #b2b8c4; font-size: 17px; cursor: pointer; }
.best { padding: 0 15px 12px; }
.definition { font-size: 15px; }
.example {
  margin-top: 8px; padding: 7px 10px; border-left: 2px solid #e8b93c; background: #fdfaf1;
  border-radius: 0 6px 6px 0; color: #5b6070; font-size: 13px; font-style: italic;
}
.relatives { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 5px; align-items: baseline; }
.relatives .label { font-size: 11px; color: #a8aebc; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
.relatives span.chip { font-size: 12.5px; color: #454b58; background: #f4f5f8; border-radius: 6px; padding: 1.5px 7px; }
.more { border-top: 1px solid #eef0f4; }
.more summary { cursor: pointer; padding: 8px 15px; color: #6a6f7b; font-size: 12.5px; list-style: none; }
.more summary::-webkit-details-marker { display: none; }
.other { padding: 2px 15px 9px; }
.other .row { padding: 6px 0; font-size: 13.5px; color: #3c414d; border-top: 1px solid #f3f4f7; display: flex; gap: 8px; }
.other .row b { color: #a8aebc; font-weight: 500; font-size: 11px; min-width: 24px; }
.foot { border-top: 1px solid #eef0f4; padding: 8px 15px; color: #a8aebc; font-size: 11.5px; background: #fbfbfc; }
`;
const style = document.createElement("style");
style.textContent = STYLE;
document.head.append(style);
function sentenceAround(text, start, end) {
	const stop = /[.!?;:]/;
	let from = start;
	let to = end;
	while (from > 0 && !stop.test(text[from - 1]) && start - from < 300) from--;
	while (to < text.length && !stop.test(text[to]) && to - end < 300) to++;
	return text.slice(from, to).trim();
}
async function show(word, sentence, rect) {
	const senses = disambiguate(dictionary, df, total, word, sentence, cues);
	panelEl.innerHTML = "";
	if (!senses.length) {
		const isWord = (await loadWords()).has(word.toLowerCase());
		panelEl.innerHTML = `<div class="best"><div class="definition">${isWord ? "It is a word, but the dictionary has no meaning for it yet." : "That does not look like a word."}</div></div>`;
	} else {
		const best = senses[0];
		const head = document.createElement("div");
		head.className = "head";
		head.innerHTML = `<span class="word"></span><span class="pos"></span>`;
		head.querySelector(".word").textContent = word;
		head.querySelector(".pos").textContent = best.p;
		const close = document.createElement("button");
		close.className = "close";
		close.textContent = "×";
		close.addEventListener("click", () => panelEl.style.display = "none");
		head.append(close);
		const body = document.createElement("div");
		body.className = "best";
		const definition = document.createElement("div");
		definition.className = "definition";
		definition.textContent = best.d;
		body.append(definition);
		if (best.e[0]) {
			const example = document.createElement("div");
			example.className = "example";
			example.textContent = best.e[0];
			body.append(example);
		}
		if (best.s?.length) {
			const row = document.createElement("div");
			row.className = "relatives";
			row.innerHTML = `<span class="label">synonyms</span>`;
			for (const s of best.s.slice(0, 4)) {
				const chip = document.createElement("span");
				chip.className = "chip";
				chip.textContent = s;
				row.append(chip);
			}
			body.append(row);
		}
		panelEl.append(head, body);
		if (senses.length > 1) {
			const more = document.createElement("details");
			more.className = "more";
			const summary = document.createElement("summary");
			summary.textContent = `${senses.length - 1} other meaning${senses.length > 2 ? "s" : ""}`;
			more.append(summary);
			const list = document.createElement("div");
			list.className = "other";
			for (const sense of senses.slice(1)) {
				const row = document.createElement("div");
				row.className = "row";
				const b = document.createElement("b");
				b.textContent = sense.p;
				row.append(b, document.createTextNode(sense.d));
				list.append(row);
			}
			more.append(list);
			panelEl.append(more);
		}
	}
	const foot = document.createElement("div");
	foot.className = "foot";
	foot.textContent = "Gloss · offline · nothing leaves this page";
	panelEl.append(foot);
	const width = Math.min(340, window.innerWidth - 24);
	let left = rect.left;
	let top = rect.bottom + 8;
	if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12;
	if (left < 12) left = 12;
	if (top + 260 > window.innerHeight) top = Math.max(12, rect.top - 250);
	panelEl.style.display = "block";
	panelEl.style.left = `${left}px`;
	panelEl.style.top = `${top}px`;
	panelEl.style.width = `${width}px`;
}
document.addEventListener("mouseup", () => {
	window.setTimeout(() => {
		const selection = window.getSelection();
		if (!selection || selection.isCollapsed) return;
		const text = selection.toString().trim();
		if (!text || text.length > 40 || /\s/.test(text)) return;
		const range = selection.getRangeAt(0);
		show(text, sentenceAround(range.startContainer.textContent || "", range.startOffset, range.endOffset), range.getBoundingClientRect());
	}, 10);
});
document.addEventListener("scroll", () => {
	panelEl.style.display = "none";
}, true);
//#endregion
