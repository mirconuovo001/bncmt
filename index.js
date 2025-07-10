const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(express.static('public'));
app.use(express.json());

// Color utility for username (for frontend, kept here for reuse)
function usernameToColor(username) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = ((hash>>24)&0xFF).toString(16).padStart(2,'0') +
                ((hash>>16)&0xFF).toString(16).padStart(2,'0') +
                ((hash>>8)&0xFF).toString(16).padStart(2,'0');
  return `#${color.slice(0,6)}`;
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Login API
app.post('/api/login', (req, res) => {
  try {
    const { role, username, pin } = req.body;
    const db = JSON.parse(fs.readFileSync('db.json'));
    const user = db.users.find(
      u => u.role === role && u.username === username && u.pin === pin
    );
    if (user) {
      res.json({ success: true, role: user.role, username: user.username });
    } else {
      res.json({ success: false, message: 'Credenziali errate' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});

// --- MISS SECTION ---

// Importi disponibili per prelievi
app.get('/api/importi-disponibili', (req, res) => {
  const db = JSON.parse(fs.readFileSync('db.json'));
  const op = db.users.find(u => u.role === 'operatore');
  res.json(op ? op.importiDisponibili : [10,20,50,100]);
});

// Richiesta prelievo (Miss)
app.post('/api/richiesta-prelievo', (req, res) => {
  try {
    const { username, importo } = req.body;
    if (!importo || importo <= 0) {
      return res.json({ success: false, message: 'Importo non valido' });
    }
    const db = JSON.parse(fs.readFileSync('db.json'));
    const user = db.users.find(u => u.username === username && u.role === 'miss');
    if (!user) {
      return res.json({ success: false, message: 'Utente non trovato' });
    }
    if (user.saldo < importo) {
      return res.json({ success: false, message: 'Saldo insufficiente' });
    }
    db.richieste.push({
      id: Date.now(),
      username,
      importo,
      stato: 'in attesa',
      data: new Date().toISOString(),
      tipo: 'prelievo'
    });
    user.storico.push({
      tipo: 'richiesta-prelievo',
      importo,
      data: new Date().toISOString(),
      note: 'Richiesta inviata'
    });
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
    res.json({ success: true, message: 'Richiesta inviata! Attendi risposta dall\'operatore.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});

// Richiesta cambio username/PIN (Miss)
app.post('/api/richiesta-cambio-profilo', (req, res) => {
  try {
    const { username, nuovoUsername, nuovoPin } = req.body;
    if (!nuovoUsername && !nuovoPin) {
      return res.json({ success: false, message: 'Serve almeno un nuovo valore' });
    }
    const db = JSON.parse(fs.readFileSync('db.json'));
    db.richieste.push({
      id: Date.now(),
      username,
      nuovoUsername,
      nuovoPin,
      stato: 'in attesa',
      data: new Date().toISOString(),
      tipo: 'cambio-profilo'
    });
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
    res.json({ success: true, message: 'Richiesta di cambio inviata!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});

// Stato richieste per Miss
app.get('/api/stato-richieste/:username', (req, res) => {
  const db = JSON.parse(fs.readFileSync('db.json'));
  const richieste = db.richieste.filter(r => r.username === req.params.username);
  res.json(richieste);
});

// Visualizza saldo + totale prelevato
app.get('/api/saldo/:username', (req, res) => {
  const db = JSON.parse(fs.readFileSync('db.json'));
  const user = db.users.find(u => u.username === req.params.username && u.role === 'miss');
  if (!user) return res.json({ success: false, message: 'Utente non trovato' });
  const totale = db.richieste.filter(
    r => r.username === user.username && r.tipo === 'prelievo' && r.stato === 'approvata'
  ).reduce((acc, r) => acc + r.importo, 0);
  res.json({ success: true, saldo: user.saldo, totalePrelevato: totale });
});

// Visualizza storico (Miss) + totale prelevato
app.get('/api/storico/:username', (req, res) => {
  const db = JSON.parse(fs.readFileSync('db.json'));
  const user = db.users.find(u => u.username === req.params.username && u.role === 'miss');
  if (!user) return res.json({ success: false, message: 'Utente non trovato' });
  const totale = db.richieste.filter(
    r => r.username === user.username && r.tipo === 'prelievo' && r.stato === 'approvata'
  ).reduce((acc, r) => acc + r.importo, 0);
  res.json({ success: true, storico: user.storico, totalePrelevato: totale });
});

// --- OPERATOR SECTION ---

// Elenco utenti (solo miss)
app.get('/api/utenti', (req, res) => {
  const db = JSON.parse(fs.readFileSync('db.json'));
  res.json(db.users.filter(u=>u.role==="miss").map(u=>({
    username: u.username, saldo: u.saldo
  })));
});

// Crea o modifica utente (operatore)
app.post('/api/crea-o-modifica-utente', (req, res) => {
  try {
    const { vecchioUsername, username, pin, saldo } = req.body;
    const db = JSON.parse(fs.readFileSync('db.json'));
    if (vecchioUsername) {
      const user = db.users.find(u => u.username === vecchioUsername && u.role === 'miss');
      if (!user) return res.json({ success: false, message: 'Utente non trovato' });
      if (username !== vecchioUsername && db.users.find(u => u.username === username))
        return res.json({ success: false, message: 'Username già esistente' });
      user.username = username;
      if (pin) user.pin = pin;
      if (typeof saldo === "number") user.saldo = saldo;
      user.storico.push({
        tipo: 'modifica-profilo-operatore',
        data: new Date().toISOString(),
        note: 'Profilo modificato dall\'operatore'
      });
      fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
      return res.json({ success: true, message: 'Utente modificato!' });
    }
    if (!username || !pin) {
      return res.json({ success: false, message: 'Username e PIN obbligatori' });
    }
    if (db.users.find(u => u.username === username)) {
      return res.json({ success: false, message: 'Username già esistente' });
    }
    db.users.push({
      role: "miss",
      username,
      pin,
      saldo: saldo || 0,
      storico: []
    });
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
    res.json({ success: true, message: 'Utente creato!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});

// Modifica saldo conto (Operatore)
app.post('/api/modifica-saldo', (req, res) => {
  try {
    const { username, nuovoSaldo } = req.body;
    const db = JSON.parse(fs.readFileSync('db.json'));
    const user = db.users.find(u => u.username === username && u.role === 'miss');
    if (!user) {
      return res.json({ success: false, message: 'Utente non trovato' });
    }
    user.saldo = nuovoSaldo;
    user.storico.push({
      tipo: 'modifica-saldo',
      saldo: nuovoSaldo,
      data: new Date().toISOString(),
      note: 'Saldo modificato dall\'operatore'
    });
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
    res.json({ success: true, message: 'Saldo modificato correttamente.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});

// Imposta importi disponibili (Operatore)
app.post('/api/imposta-importi', (req, res) => {
  try {
    const { importiDisponibili } = req.body;
    const db = JSON.parse(fs.readFileSync('db.json'));
    const op = db.users.find(u => u.role === 'operatore');
    if (!op) {
      return res.json({ success: false, message: 'Operatore non trovato' });
    }
    op.importiDisponibili = importiDisponibili;
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
    res.json({ success: true, message: 'Importi aggiornati!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});

// --- RICHIESTE GESTIONE ---

// Elenca richieste (tutte, per vista operatore)
app.get('/api/richieste', (req, res) => {
  const db = JSON.parse(fs.readFileSync('db.json'));
  res.json(db.richieste);
});

// Gestisci richiesta (operatore) - prelievo/cambio-profilo
app.post('/api/gestisci-richiesta', (req, res) => {
  try {
    const { id, approva } = req.body;
    const db = JSON.parse(fs.readFileSync('db.json'));
    const richiesta = db.richieste.find(r => r.id === id);
    if (!richiesta || richiesta.stato !== 'in attesa') {
      return res.json({ success: false, message: 'Richiesta non trovata o già gestita.' });
    }
    richiesta.stato = approva ? 'approvata' : 'rifiutata';
    richiesta.dataGestione = new Date().toISOString();

    if (richiesta.tipo === 'prelievo' && approva) {
      const user = db.users.find(u => u.username === richiesta.username && u.role === 'miss');
      if (user) {
        user.saldo -= richiesta.importo;
        user.storico.push({
          tipo: 'prelievo-approvato',
          importo: richiesta.importo,
          data: richiesta.dataGestione,
          note: 'Prelievo approvato dall\'operatore'
        });
      }
      const op = db.users.find(u => u.role === 'operatore');
      if (op) {
        op.storico = op.storico || [];
        op.storico.push({
          tipo: 'prelievo-erogato',
          username: richiesta.username,
          importo: richiesta.importo,
          data: richiesta.dataGestione,
          note: 'Prelievo consegnato'
        });
      }
    }
    if (richiesta.tipo === 'cambio-profilo' && approva) {
      const user = db.users.find(u => u.username === richiesta.username && u.role === 'miss');
      if (user) {
        if (richiesta.nuovoUsername && richiesta.nuovoUsername !== user.username) {
          if (db.users.find(u => u.username === richiesta.nuovoUsername)) {
            richiesta.stato = 'rifiutata';
            return res.json({ success: false, message: 'Nuovo username già esistente. Modifica rifiutata.' });
          }
          user.username = richiesta.nuovoUsername;
        }
        if (richiesta.nuovoPin) user.pin = richiesta.nuovoPin;
        user.storico.push({
          tipo: 'cambio-profilo-approvato',
          data: richiesta.dataGestione,
          note: 'Cambio username/PIN approvato dall\'operatore'
        });
      }
    }
    if (richiesta.tipo === 'cambio-profilo' && !approva) {
      const user = db.users.find(u => u.username === richiesta.username && u.role === 'miss');
      if (user) {
        user.storico.push({
          tipo: 'cambio-profilo-rifiutato',
          data: richiesta.dataGestione,
          note: 'Cambio username/PIN rifiutato'
        });
      }
    }
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
    res.json({ success: true, message: approva ? 'Richiesta approvata!' : 'Richiesta rifiutata.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});

app.post('/api/richiesta-nuovo-utente', (req, res) => {
  const { username, pin, nome } = req.body;
  if (!username || !pin || !nome) {
    return res.json({ success: false, message: "Compila tutti i campi!" });
  }
  const db = JSON.parse(fs.readFileSync('db.json'));
  // Verifica se username già esiste
  if (db.users.find(u => u.username === username)) {
    return res.json({ success: false, message: "Username già esistente!" });
  }
  if (!db.richieste) db.richieste = [];
  db.richieste.push({
    id: Date.now(),
    tipo: 'creazione-nuovo-utente',
    usernameRichiesto: username,
    pinRichiesto: pin,
    nomeCompleto: nome,
    stato: 'in attesa',
    data: new Date().toISOString()
  });
  fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
  res.json({ success: true, message: "Richiesta inviata all'operatore!" });
});

// --- STORICI ---

// Visualizza storico (operator): tutto di tutti, nomi colorati + somma
app.get('/api/storico-operatore', (req, res) => {
  const db = JSON.parse(fs.readFileSync('db.json'));
  // storico di tutti
  let storico = [];
  db.users.filter(u=>u.role==="miss").forEach(u=>{
    u.storico.forEach(s=>{
      storico.push({...s, username: u.username});
    });
  });
  // totale prelevato globale
  const totale = db.richieste.filter(
    r => r.tipo === 'prelievo' && r.stato === 'approvata'
  ).reduce((acc, r) => acc + r.importo, 0);
  res.json({ success: true, storico, totalePrelevato: totale });
});

const PORT = process.env.PORT || 3000;
// Operatore: modifica il proprio username e/o pin
app.post('/api/cambia-profilo-operatore', (req, res) => {
  try {
    const { oldUsername, newUsername, newPin } = req.body;
    const db = JSON.parse(fs.readFileSync('db.json'));
    const op = db.users.find(u => u.role === 'operatore' && u.username === oldUsername);
    if (!op) {
      return res.json({ success: false, message: 'Operatore non trovato' });
    }
    if (newUsername) {
      if (db.users.find(u => u.username === newUsername))
        return res.json({ success: false, message: 'Username già esistente!' });
      op.username = newUsername;
    }
    if (newPin) op.pin = newPin;
    op.storico = op.storico || [];
    op.storico.push({
      tipo: 'modifica-profilo',
      data: new Date().toISOString(),
      note: 'Profilo operatore modificato'
    });
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
    res.json({ success: true, message: 'Profilo operatore modificato!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});
app.listen(PORT, () => {
  console.log(`Server in ascolto su http://localhost:${PORT}`);
});