document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  const appDiv = document.getElementById('app');
  let session = {};

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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const role = document.getElementById('role').value;
    const username = document.getElementById('username').value.trim();
    const pin = document.getElementById('pin').value.trim();

    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, username, pin })
    });
    const data = await res.json();

    if (data.success) {
      form.style.display = 'none';
      session = { role: data.role, username: data.username };
      renderDashboard();
    } else {
      alert(data.message || "Accesso negato");
    }
  });

  function renderDashboard() {
    if (session.role === "miss") {
      appDiv.innerHTML = `
        <h2>Area Cliente (Miss)</h2>
        <ul>
          <li><button id="richiedi-prelievo">Richiedi prelievo</button></li>
          <li><button id="stato-richieste">Vedi stato richieste</button></li>
          <li><button id="vedi-saldo">Visualizza saldo</button></li>
          <li><button id="vedi-storico">Visualizza storico</button></li>
          <li><button id="richiedi-cambio-profilo">Richiedi cambio username/PIN</button></li>
        </ul>
        <div id="miss-area"></div>
      `;

      document.getElementById('richiedi-prelievo').onclick = async () => {
        const area = document.getElementById('miss-area');
        area.innerHTML = "<h3>Richiedi prelievo</h3><p>Caricamento importi disponibili...</p>";
        const res = await fetch('/api/importi-disponibili');
        const importi = await res.json();
        area.innerHTML = `
          <h3>Richiedi prelievo</h3>
          <form id="prelievo-form">
            <label for="importo">Scegli importo:</label>
            <select id="importo" required>
              ${importi.map(i=>`<option value="${i}">${i} &euro;</option>`).join('')}
            </select>
            <button type="submit">Invia richiesta</button>
          </form>
          <div id="prelievo-msg"></div>
        `;
        document.getElementById('prelievo-form').onsubmit = async (e) => {
          e.preventDefault();
          const importo = parseInt(document.getElementById('importo').value, 10);
          const res = await fetch('/api/richiesta-prelievo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: session.username, importo })
          });
          const risposta = await res.json();
          document.getElementById('prelievo-msg').innerText = risposta.message;
        };
      };

      document.getElementById('stato-richieste').onclick = async () => {
        const area = document.getElementById('miss-area');
        area.innerHTML = "<h3>Stato richieste</h3><p>Caricamento...</p>";
        const res = await fetch('/api/stato-richieste/' + encodeURIComponent(session.username));
        const richieste = await res.json();
        if (!richieste.length) {
          area.innerHTML = "<p>Nessuna richiesta trovata.</p>";
          return;
        }
        area.innerHTML = richieste.reverse().map(r =>
          `<div style="border:1px solid #6ef5c5; margin:8px; padding:8px;">
            <b>${r.tipo === 'prelievo' ? 'Prelievo' : 'Cambio username/PIN'}</b>
            ${r.tipo === 'prelievo' && r.importo ? `di <b>${r.importo}€</b>` : ""}
            <br>Stato: <b>${r.stato}</b><br>
            <i>Data richiesta: ${new Date(r.data).toLocaleString()}</i>
            ${r.dataGestione ? `<br><i>Gestita il: ${new Date(r.dataGestione).toLocaleString()}</i>` : ""}
          </div>`
        ).join("");
      };

      document.getElementById('vedi-saldo').onclick = async () => {
        const res = await fetch('/api/saldo/' + encodeURIComponent(session.username));
        const data = await res.json();
        if (data.success)
          document.getElementById('miss-area').innerHTML = `
            <p>Saldo attuale: <b>${data.saldo} €</b></p>
            <p>Totale prelevato fino ad ora: <b>${data.totalePrelevato} €</b></p>`;
        else
          document.getElementById('miss-area').innerHTML = `<p>${data.message}</p>`;
      };

      document.getElementById('vedi-storico').onclick = async () => {
        const area = document.getElementById('miss-area');
        area.innerHTML = "<h3>Storico operazioni</h3><p>Caricamento...</p>";
        const res = await fetch('/api/storico/' + encodeURIComponent(session.username));
        const data = await res.json();
        if (!data.success) {
          area.innerHTML = `<p>${data.message}</p>`;
          return;
        }
        area.innerHTML = `<h4>Totale prelevato: <b>${data.totalePrelevato} €</b></h4>` + 
          data.storico.reverse().map(op =>
            `<div style="border:1px solid #6ef5c5; margin:8px; padding:8px;">
              <b>${op.tipo.replace(/-/g, ' ')}</b> ${op.importo ? op.importo + '€' : ''} 
              <br><i>${new Date(op.data).toLocaleString()}</i> <br>
              ${op.note ? `<span>${op.note}</span>` : ""}
            </div>`
          ).join("");
      };

      document.getElementById('richiedi-cambio-profilo').onclick = () => {
        document.getElementById('miss-area').innerHTML = `
          <h3>Richiedi cambio username e/o PIN</h3>
          <form id="cambia-profilo-form">
            <label for="nuovoUsername">Nuovo username (facoltativo):</label>
            <input type="text" id="nuovoUsername" />
            <label for="nuovoPin">Nuovo PIN (facoltativo):</label>
            <input type="password" id="nuovoPin" maxlength="6" />
            <button type="submit">Invia richiesta</button>
          </form>
          <div id="cambia-profilo-msg"></div>
        `;
        document.getElementById('cambia-profilo-form').onsubmit = async (e) => {
          e.preventDefault();
          const nuovoUsername = document.getElementById('nuovoUsername').value.trim();
          const nuovoPin = document.getElementById('nuovoPin').value.trim();
          const res = await fetch('/api/richiesta-cambio-profilo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: session.username, nuovoUsername, nuovoPin })
          });
          const risposta = await res.json();
          document.getElementById('cambia-profilo-msg').innerText = risposta.message;
        };
      };

    } else if (session.role === "operatore") {
      appDiv.innerHTML = `
        <h2>Area Operatore (Bancomat Umano)</h2>
        <ul>
          <li><button id="gestisci-utenti">Crea/Modifica utente</button></li>
          <li><button id="gestisci-prelievi">Imposta importi disponibili</button></li>
          <li><button id="vedi-richieste">Gestisci richieste utenti</button></li>
          <li><button id="modifica-saldo">Modifica saldo utente</button></li>
          <li><button id="vedi-storico-op">Storico globale</button></li>
          <li><button id="modifica-profilo-operatore">Cambia il tuo username/PIN</button></li>
        </ul>
        <div id="operatore-area"></div>
      `;
      document.getElementById('modifica-profilo-operatore').onclick = () => {
        document.getElementById('operatore-area').innerHTML = `
          <h3>Modifica il tuo username e/o PIN</h3>
          <form id="modifica-operatore-form">
            <label for="nuovoOpUsername">Nuovo username (lascia vuoto per non cambiare):</label>
            <input type="text" id="nuovoOpUsername" />
            <label for="nuovoOpPin">Nuovo PIN (lascia vuoto per non cambiare):</label>
            <input type="password" id="nuovoOpPin" maxlength="6" />
            <button type="submit">Salva</button>
          </form>
          <div id="modifica-operatore-msg"></div>
        `;
        document.getElementById('modifica-operatore-form').onsubmit = async (e) => {
          e.preventDefault();
          const newUsername = document.getElementById('nuovoOpUsername').value.trim();
          const newPin = document.getElementById('nuovoOpPin').value.trim();
          const res = await fetch('/api/cambia-profilo-operatore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldUsername: session.username, newUsername, newPin })
          });
          const data = await res.json();
          document.getElementById('modifica-operatore-msg').innerText = data.message;
          if (data.success && newUsername) session.username = newUsername;
        };
      };

      document.getElementById('gestisci-utenti').onclick = async () => {
        const area = document.getElementById('operatore-area');
        const utentiRes = await fetch('/api/utenti');
        const utenti = await utentiRes.json();
        area.innerHTML = `
          <h3>Crea o modifica utente</h3>
          <form id="utenti-form">
            <label for="selezionaUtente">Seleziona utente per modifica (lascia vuoto per nuovo):</label>
            <select id="selezionaUtente">
              <option value="">Nuovo utente</option>
              ${utenti.map(u => `<option value="${u.username}">${u.username}</option>`).join('')}
            </select>
            <label for="newUsername">Username:</label>
            <input type="text" id="newUsername" required />
            <label for="newPin">PIN:</label>
            <input type="password" id="newPin" maxlength="6" required />
            <label for="newSaldo">Saldo:</label>
            <input type="number" id="newSaldo" value="0" required />
            <button type="submit">Salva</button>
          </form>
          <div id="utenti-msg"></div>
        `;
        document.getElementById('selezionaUtente').onchange = function() {
          const sel = this.value;
          if (!sel) {
            document.getElementById('newUsername').value = "";
            document.getElementById('newPin').value = "";
            document.getElementById('newSaldo').value = 0;
          } else {
            const user = utenti.find(u => u.username === sel);
            document.getElementById('newUsername').value = user.username;
            document.getElementById('newSaldo').value = user.saldo;
            document.getElementById('newPin').value = "";
          }
        };
        document.getElementById('utenti-form').onsubmit = async (e) => {
          e.preventDefault();
          const vecchioUsername = document.getElementById('selezionaUtente').value || undefined;
          const username = document.getElementById('newUsername').value.trim();
          const pin = document.getElementById('newPin').value.trim();
          const saldo = parseFloat(document.getElementById('newSaldo').value);
          const res = await fetch('/api/crea-o-modifica-utente', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vecchioUsername, username, pin, saldo })
          });
          const data = await res.json();
          document.getElementById('utenti-msg').innerText = data.message;
        };
      };

      document.getElementById('gestisci-prelievi').onclick = async () => {
        const area = document.getElementById('operatore-area');
        area.innerHTML = `
          <h3>Imposta importi disponibili</h3>
          <form id="importi-form">
            <label for="importi">Importi separati da virgola (es: 10,20,50,100):</label>
            <input type="text" id="importi" required value="10,20,50,100" />
            <button type="submit">Aggiorna</button>
          </form>
          <div id="importi-msg"></div>
        `;
        document.getElementById('importi-form').onsubmit = async (e) => {
          e.preventDefault();
          const importi = document.getElementById('importi').value.split(',').map(x => parseInt(x.trim(), 10)).filter(x => x > 0);
          const res = await fetch('/api/imposta-importi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ importiDisponibili: importi })
          });
          const data = await res.json();
          document.getElementById('importi-msg').innerText = data.message;
        };
      };

      document.getElementById('vedi-richieste').onclick = async () => {
        const area = document.getElementById('operatore-area');
        area.innerHTML = "<h3>Gestione richieste utenti</h3><p>Caricamento...</p>";
        const res = await fetch('/api/richieste');
        const richieste = await res.json();
        if (!richieste.length) {
          area.innerHTML = "<p>Nessuna richiesta trovata.</p>";
          return;
        }
        area.innerHTML = "<h4>Richieste di tutti gli utenti</h4>" +
          richieste.reverse().map(r => {
            const color = usernameToColor(r.username);
            let label = '';
            if (r.tipo === 'prelievo') {
              label = `Prelievo di <b>${r.importo}€</b>`;
            } else if (r.tipo === 'cambio-profilo') {
              let campi = [];
              if (r.nuovoUsername) campi.push(`Nuovo username: <b>${r.nuovoUsername}</b>`);
              if (r.nuovoPin) campi.push(`Nuovo PIN: <b>${r.nuovoPin}</b>`);
              label = `Cambio username/PIN<br>${campi.join('<br>')}`;
            } else if (r.tipo === 'creazione-nuovo-utente') {
              label = `Richiesta nuovo utente<br>
                       Username: <b>${r.usernameRichiesto}</b><br>
                       PIN: <b>${r.pinRichiesto}</b><br>
                       Nome: <b>${r.nomeCompleto}</b>`;
            }
            return `<div style="border:1px solid #6ef5c5; margin:8px; padding:8px;">
              <span class="user-color" style="background:${color}">${r.username}</span> 
              - ${label} 
              <br>Stato: <b>${r.stato}</b> 
              <br><i>Data richiesta: ${new Date(r.data).toLocaleString()}</i>
              ${r.dataGestione ? `<br><i>Gestita il: ${new Date(r.dataGestione).toLocaleString()}</i>` : ""}
              ${r.stato === 'in attesa' ? `
                <button onclick="gestisciRichiesta(${r.id}, true)">Approva</button>
                <button onclick="gestisciRichiesta(${r.id}, false)">Rifiuta</button>
              ` : ""}
            </div>`;
          }).join("");
      };

      window.gestisciRichiesta = async (id, approva) => {
        const area = document.getElementById('operatore-area');
        const res = await fetch('/api/gestisci-richiesta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, approva })
        });
        const data = await res.json();
        alert(data.message);
        document.getElementById('vedi-richieste').click();
      };

      document.getElementById('richiedi-nuovo-utente').onclick = () => {
        document.getElementById('login-area').innerHTML = `
          <h3>Richiesta creazione nuovo utente</h3>
          <form id="form-nuovo-utente">
            <label>Username desiderato: <input type="text" id="nuovo-username"></label><br>
            <label>PIN desiderato: <input type="password" id="nuovo-pin" maxlength="6"></label><br>
            <label>Nome completo: <input type="text" id="nuovo-nome"></label><br>
            <button type="submit">Invia richiesta</button>
            <button type="button" id="annulla-nuovo-utente">Annulla</button>
          </form>
          <div id="msg-nuovo-utente"></div>
        `;

        document.getElementById('form-nuovo-utente').onsubmit = async (e) => {
          e.preventDefault();
          const username = document.getElementById('nuovo-username').value.trim();
          const pin = document.getElementById('nuovo-pin').value.trim();
          const nome = document.getElementById('nuovo-nome').value.trim();
          const res = await fetch('/api/richiesta-nuovo-utente', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, pin, nome })
          });
          const data = await res.json();
          document.getElementById('msg-nuovo-utente').innerText = data.message;
        };

        document.getElementById('annulla-nuovo-utente').onclick = () => {
          // Ricarica la schermata di login
          location.reload();
        };
      };
      
      document.getElementById('modifica-saldo').onclick = async () => {
        const area = document.getElementById('operatore-area');
        const utentiRes = await fetch('/api/utenti');
        const utenti = await utentiRes.json();
        area.innerHTML = `
          <h3>Modifica saldo utente</h3>
          <form id="saldo-form">
            <label for="userMod">Utente:</label>
            <select id="userMod" required>
              ${utenti.map(u => `<option value="${u.username}">${u.username} (saldo: ${u.saldo}€)</option>`).join('')}
            </select>
            <label for="nuovoSaldo">Nuovo saldo:</label>
            <input type="number" id="nuovoSaldo" required />
            <button type="submit">Aggiorna saldo</button>
          </form>
          <div id="saldo-msg"></div>
        `;
        document.getElementById('saldo-form').onsubmit = async (e) => {
          e.preventDefault();
          const username = document.getElementById('userMod').value;
          const nuovoSaldo = parseFloat(document.getElementById('nuovoSaldo').value);
          const res = await fetch('/api/modifica-saldo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, nuovoSaldo })
          });
          const data = await res.json();
          document.getElementById('saldo-msg').innerText = data.message;
        };
      };

      document.getElementById('vedi-storico-op').onclick = async () => {
        const area = document.getElementById('operatore-area');
        area.innerHTML = "<h3>Storico operazioni (tutti gli utenti)</h3><p>Caricamento...</p>";
        const res = await fetch('/api/storico-operatore');
        const data = await res.json();
        if (!data.success) {
          area.innerHTML = `<p>${data.message}</p>`;
          return;
        }
        area.innerHTML = `<h4>Totale prelevato da tutti: <b>${data.totalePrelevato} €</b></h4>` +
          data.storico.reverse().map(op => {
            const color = usernameToColor(op.username||'');
            return `<div style="border:1px solid #6ef5c5; margin:8px; padding:8px;">
              <span class="user-color" style="background:${color}">${op.username||''}</span>
              <b>${op.tipo.replace(/-/g, ' ')}</b> 
              ${op.importo ? op.importo + '€' : ''} 
              <br><i>${new Date(op.data).toLocaleString()}</i> 
              ${op.note ? `<br><span>${op.note}</span>` : ""}
            </div>`;
          }).join("");
      };

    }
  }
});