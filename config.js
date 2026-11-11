// =====================================================================
//  config.js — сайт баптаулары (Claude-сыз, өз сайтыңда жұмыс істеуі үшін)
//  1) Firebase жобасының web-config мәндерін төмендегі firebase: {...} ішіне қой.
//  2) adminEmailHash — әкімшінің Google email-інің SHA-256 хэші.
//  firebase: null болса — ойын Claude ішінде (claude.ai) немесе «Жалғыз режимде» жұмыс істейді.
// =====================================================================
window.JAS_CONFIG = {
  firebase: {
    apiKey: "AIzaSyCSifEU2F5eox3qymRYqxacNX4dZPxRmIw",
    authDomain: "jas-abay.firebaseapp.com",
    databaseURL: "https://jas-abay-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "jas-abay",
    storageBucket: "jas-abay.firebasestorage.app",
    messagingSenderId: "746877913058",
    appId: "1:746877913058:web:124c7ad696748f021a1bbb"
  },
  // мысалы:
  // firebase: { apiKey: "...", authDomain: "jas-abay.firebaseapp.com", databaseURL: "https://jas-abay-default-rtdb.europe-west1.firebasedatabase.app",
  //             projectId: "jas-abay", storageBucket: "jas-abay.appspot.com", messagingSenderId: "...", appId: "..." },
  // әкімшінің Google email-інің SHA-256 хэші (email-дің өзі ашық жазылмайды)
  adminEmailHash: '91a44c43f8f48fb881e95c29a3efb97d9095799bd009115fd69e33130589db13',
  // Claude ішінде әкімші бөлімі тек осы аккаунтқа көрінеді (иесі)
  claudeOwners: ['u_tSwYIVftFUqjjfQMxQBqAg']
};
