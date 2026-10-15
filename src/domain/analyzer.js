import { TextFold } from './text-fold.js';
import { TurkishStemmer } from './turkish-stemmer.js';

/**
 * How an index turns words into terms: always folded, and for `language: 'tr'` stemmed as well.
 * One analyzer is used for indexing, queries and highlighting of the same index.
 */
export class Analyzer {
  static LANGUAGES = /** @type {const} */ (['none', 'tr']);

  /** @param {'none'|'tr'} language */
  constructor(language) {
    this.language = language;
  }

  /** @param {string} language */
  static for(language) {
    return new Analyzer(language === 'tr' ? 'tr' : 'none');
  }

  /** One folded token to its term. @param {string} folded */
  term(folded) {
    return this.language === 'tr' ? TurkishStemmer.stem(folded) : folded;
  }

  /** Text as the full-text index stores it: terms separated by spaces. @param {string} text */
  text(text) {
    const folded = TextFold.fold(text);
    return this.language === 'none' ? folded : TextFold.tokens(folded).map((t) => this.term(t.text)).join(' ');
  }
}
