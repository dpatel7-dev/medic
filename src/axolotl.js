'use strict';
// Lotl, medic's axolotl. Axolotls are famous for healing themselves, which is
// a good thing for a medic to be. Every letter is one pixel; '.' is see-through.

const BIG = [
  '..........................',
  '..........r...............',
  '...........R..r...........',
  '..........rR.R..r.........',
  '............RR.R.R........',
  '..............RRQPPPPP....',
  '........rRRRRRQPPPPPPPP...',
  '..............QPPPPPPPEPP.',
  '............rRQPPPPPPPPPP.',
  '....f......r.QPPPPPPPPMMP.',
  '..ffFf......QPPPPPPPPPPPP.',
  '.fFFFPPPPPPPPPPPPpppppppQ.',
  'fFFPPPPPPPPPPPPpppppppQQ..',
  '.fFFQQPPPPPPPPPPPPPPQQ....',
  '..ff..QQLLQQQQQQLLQ.......',
  '.......LL......LL.........',
  '......LL......LL..........',
];

const MINI = [
  '............',
  '.....r.r....',
  '......RRPPP.',
  '...rRRQPPEP.',
  '.f...QPPPPMP',
  'fFPPPPPpppQ.',
  '.fQQPPPPPQ..',
  '...L...L....',
  '............',
];

const INK = { P: '#f6a6b8', p: '#ffd3dd', Q: '#e5859c', R: '#d84a7a', r: '#f27aa6', E: '#1d1416', e: '#ffffff', M: '#b8506c', F: '#fbc4d1', f: '#e98aa5', L: '#e5859c' };

module.exports = { BIG, MINI, INK, NAME: 'Lotl' };
