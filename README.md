# SoftHand+ Web

[Italiano](#italiano) · [English](#english)

[Apri la web app / Open the web app](https://qbrobotics-ads.github.io/softhand-web/)

## Italiano

Interfaccia web per collegare e controllare la SoftHand+ tramite Bluetooth Low Energy. La connessione alla mano avviene direttamente dal dispositivo che apre la pagina. I pulsanti in alto a destra cambiano lingua e tema e salvano la scelta nel browser.

### Come usarla

1. Accendi la SoftHand+ e disconnettila da eventuali altre app. Tieni dita e oggetti fuori dalla presa durante le prove.
2. Apri il link HTTPS in un browser compatibile con Web Bluetooth. Usa Chrome su Android o sul PC. Su iPhone apri il link in **Bluefy**.
3. Premi **Cerca e connetti**, seleziona la mano e attendi la visualizzazione dell’ID e dello stato dei motori.
4. Verifica nella GUI ufficiale che la mano sia in modalità posizione con ingresso seriale. Conferma la casella nella pagina, poi premi **Abilita e apri**. Se i motori sono già abilitati, puoi premere **Apri**.
5. Seleziona una percentuale e premi **Invia posizione**. Il cursore da solo non invia comandi. Il 100% corrisponde al riferimento fisso di `19000` unità. I pulsanti **25%**, **50%** e **75%** impostano il cursore. Premi **Avvia lettura posizione e corrente** per aggiornare i valori degli encoder e la corrente in mA. Usa **Ferma lettura** per interrompere gli aggiornamenti.
6. Premi **Disabilita motori** e attendi la conferma prima di disconnettere. La disconnessione Bluetooth non garantisce lo spegnimento dei motori.

In **03 Log**, **Scarica log (.txt)** esporta le ultime 1000 voci, inclusi orari UTC, pacchetti BLE, letture ed eventuali informazioni firmware. **Scarica misure (.csv)** esporta le letture disponibili, una riga per campione. Per un grafico usa `elapsed_ms` come asse del tempo e le colonne delle correnti o degli encoder come serie. In Excel, importa il file selezionando la virgola come separatore.

### Pubblicazione

La pagina usa HTML, CSS e JavaScript statici e non richiede una compilazione. Per pubblicarla su GitHub Pages, tieni `index.html`, i file JavaScript, il CSS e le immagini nella radice del branch `main`. In **Settings → Pages** seleziona **Deploy from a branch**, `main` e `/(root)`.

## English

Browser interface for connecting to and controlling a SoftHand+ over Bluetooth Low Energy. The device that opens the page connects directly to the hand. The buttons in the upper right switch the language and theme, and the browser saves your choices.

### How to use it

1. Power on the SoftHand+ and disconnect it from any other apps. Keep fingers and objects clear of the grip during testing.
2. Open the HTTPS link in a browser that supports Web Bluetooth. Use Chrome on Android or on your computer. On iPhone, open the link in **Bluefy**.
3. Select **Find and connect**, choose the hand, and wait for the device ID and motor status to appear.
4. In the official GUI, verify that the hand is set to position control with serial input. Check the confirmation box on the page, then select **Enable and open**. If the motors are already enabled, you can select **Open**.
5. Choose a percentage and select **Send position**. Moving the slider alone sends no command. A setting of 100% corresponds to a fixed target of `19000` units. The **25%**, **50%**, and **75%** buttons set the slider. Select **Start position and current readings** to refresh encoder values and current in mA. Select **Stop readings** to stop updates.
6. Select **Disable motors** and wait for confirmation before disconnecting. Losing the Bluetooth connection does not guarantee that the motors are disabled.

In **03 Log**, **Download log (.txt)** exports the latest 1000 entries, including UTC timestamps, BLE packets, readings, and any firmware information retrieved. **Download measurements (.csv)** exports available readings, one row per sample. Use `elapsed_ms` as the time axis and the current or encoder columns as series. In Excel, import the file with comma as the delimiter.

### Deployment

The page uses static HTML, CSS, and JavaScript and requires no build step. To publish it with GitHub Pages, keep `index.html`, the JavaScript and CSS files, and the images at the root of the `main` branch. In **Settings → Pages**, select **Deploy from a branch**, `main`, and `/(root)`.
