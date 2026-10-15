/**
 * A small rule-based Turkish stemmer for search: no dictionary, so it is approximate. It works on
 * folded text (see TextFold: no diacritics, dotless i folded) and strips at most one suffix from
 * each group, from the end of the word inwards: case (and the buffer letters before it),
 * possessive, plural (a dative vowel only right after a possessive). A stem keeps at least three letters. Indexed text and queries go through the
 * same function, so "kitaplarımızdan", "kitapları" and "kitap" all meet at "kitap".
 */
export class TurkishStemmer {
  static MIN_STEM = 3;

  /** Longest first inside each group. */
  static GROUPS = [
    ['ndan', 'nden', 'ntan', 'nten', 'nda', 'nde', 'nin', 'nun', 'dan', 'den', 'tan', 'ten', 'yla', 'yle', 'da', 'de', 'ta', 'te', 'la', 'le', 'ya', 'ye', 'yi', 'yu', 'na', 'ne', 'ni', 'nu', 'in', 'un'],
    ['larimiz', 'lerimiz', 'lariniz', 'leriniz', 'imiz', 'umuz', 'iniz', 'unuz', 'lari', 'leri', 'si', 'su', 'im', 'um'],
    ['lar', 'ler'],
  ];

  /** @param {string} word A folded token. */
  static stem(word) {
    let w = word;
    if (w.length <= TurkishStemmer.MIN_STEM || /^\d+$/.test(w)) return w;
    // A bare dative vowel is only taken after a possessive ("öğretmenlerimize"): on its own it would cut "masa" to "mas".
    const bare = w.slice(0, -1);
    if (/[ae]$/.test(w) && TurkishStemmer.GROUPS[1].some((p) => bare.endsWith(p) && bare.length - p.length >= TurkishStemmer.MIN_STEM)) w = bare;
    for (const group of TurkishStemmer.GROUPS) {
      for (const suffix of group) {
        if (w.length - suffix.length >= TurkishStemmer.MIN_STEM && w.endsWith(suffix)) { w = w.slice(0, -suffix.length); break; }
      }
    }
    return w;
  }
}
