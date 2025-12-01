//
// APPLE MUSIC GLASS — APP.JS FINAL CORRIGÉ
//

console.log("app.js chargé");

// -------------------------------------------------------------
// Le player NE DOIT PAS démarrer tant que le worklet n'est pas prêt.
// -------------------------------------------------------------
window.addEventListener("worklet-ready", () => {
    console.log("Worklet prêt, initialisation du player...");
    initPlayer();
});


// -------------------------------------------------------------
// FONCTION PRINCIPALE DU PLAYER
// -------------------------------------------------------------
function initPlayer() {

    console.log("initPlayer()");

    let audioCtx = window.audioCtx;
    let workletNode = null;
    let currentBuffer = null;

    let playlist = [];
    let currentIndex = 0;

    let pitchSemitones = 0;
    let tempo = 1;
    let isPlaying = false;

    let ui = {};

    // ---------------------------------------------------------
    // UI BUILD
    // ---------------------------------------------------------
    buildUI();

    ui.fileInput.addEventListener("change", handleFileSelect);
    ui.playBtn.addEventListener("click", togglePlay);
    ui.nextBtn.addEventListener("click", () => loadTrack(currentIndex + 1));
    ui.prevBtn.addEventListener("click", () => loadTrack(currentIndex - 1));

    ui.pitchSlider.addEventListener("input", () => {
        pitchSemitones = parseInt(ui.pitchSlider.value);
        updatePitch();
        ui.pitchValue.textContent = pitchSemitones + " st";
    });

    ui.tempoSlider.addEventListener("input", () => {
        tempo = parseFloat(ui.tempoSlider.value);
        updateTempo();
        ui.tempoValue.textContent = tempo.toFixed(2) + "x";
    });

    ui.timeline.addEventListener("input", scrubTimeline);

    // ---------------------------------------------------------
    // UI BUILDER
    // ---------------------------------------------------------
    function buildUI() {
        document.body.innerHTML = `
        <div class="player-container">

            <div class="cover"></div>

            <div class="track-info">
                <h2 id="track-title">Aucune piste</h2>
                <p id="track-artist">Importez un fichier audio…</p>
            </div>

            <div class="controls">
                <button id="prev-btn">⏮</button>
                <button id="play-btn">▶️</button>
                <button id="next-btn">⏭</button>
            </div>

            <div class="timeline-container">
                <span id="time-current">0:00</span>
                <input type="range" id="timeline" min="0" max="100" value="0">
                <span id="time-total">0:00</span>
            </div>

            <div class="sliders">
                <div>
                    <label>Pitch</label>
                    <input type="range" id="pitch" min="-12" max="12" value="0">
                    <span id="pitch-value">0 st</span>
                </div>

                <div>
                    <label>Tempo</label>
                    <input type="range" id="tempo" min="0.5" max="2" step="0.01" value="1">
                    <span id="tempo-value">1.00x</span>
                </div>
            </div>

            <input type="file" id="file-input" accept="audio/*">

            <div class="playlist" id="playlist"></div>
        </div>
        `;

        ui = {
            fileInput: document.getElementById("file-input"),
            playBtn: document.getElementById("play-btn"),
            nextBtn: document.getElementById("next-btn"),
            prevBtn: document.getElementById("prev-btn"),
            timeline: document.getElementById("timeline"),
            timeCurrent: document.getElementById("time-current"),
            timeTotal: document.getElementById("time-total"),
            trackTitle: document.getElementById("track-title"),
            trackArtist: document.getElementById("track-artist"),
            playlistContainer: document.getElementById("playlist"),
            pitchSlider: document.getElementById("pitch"),
            pitchValue: document.getElementById("pitch-value"),
            tempoSlider: document.getElementById("tempo"),
            tempoValue: document.getElementById("tempo-value")
        };

        document.getElementById("app-root").remove();
    }


    // ---------------------------------------------------------
    // FILE IMPORT
    // ---------------------------------------------------------
    async function handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        const arrayBuffer = await file.arrayBuffer();
        currentBuffer = await audioCtx.decodeAudioData(arrayBuffer);

        playlist.push({
            title: file.name,
            artist: "Local File",
            buffer: currentBuffer
        });

        renderPlaylist();
        loadTrack(playlist.length - 1);
    }


    // ---------------------------------------------------------
    // LOAD + START TRACK
    // ---------------------------------------------------------
    async function loadTrack(index) {

        if (playlist.length === 0) return;

        if (index < 0) index = playlist.length - 1;
        if (index >= playlist.length) index = 0;

        currentIndex = index;

        const track = playlist[index];
        currentBuffer = track.buffer;

        ui.trackTitle.textContent = track.title;
        ui.trackArtist.textContent = track.artist;

        startPlayback();
    }

    async function startPlayback() {

        if (workletNode) workletNode.disconnect();

        workletNode = new AudioWorkletNode(audioCtx, "soundtouch-worklet");

        workletNode.port.postMessage({
            message: "INITIALIZE_PROCESSOR",
            detail: [
                { sampleRate: currentBuffer.sampleRate, length: currentBuffer.length },
                currentBuffer.getChannelData(0),
                currentBuffer.numberOfChannels > 1
                    ? currentBuffer.getChannelData(1)
                    : currentBuffer.getChannelData(0)
            ]
        });

        workletNode.port.onmessage = (e) => {
            if (e.data.message === "SOURCEPOSITION") {
                const pos = e.data.detail;
                updateTimeline(pos / currentBuffer.sampleRate);
            }
        };

        updatePitch();
        updateTempo();

        workletNode.connect(audioCtx.destination);

        if (audioCtx.state === "suspended") {
            await audioCtx.resume();
        }

        isPlaying = true;
        ui.playBtn.textContent = "⏸";
    }


    // ---------------------------------------------------------
    // CONTROLS
    // ---------------------------------------------------------
    function togglePlay() {
        if (!workletNode) return;

        if (isPlaying) {
            audioCtx.suspend();
            ui.playBtn.textContent = "▶️";
        } else {
            audioCtx.resume();
            ui.playBtn.textContent = "⏸";
        }

        isPlaying = !isPlaying;
    }

    // ---------------------------------------------------------
    // PITCH & TEMPO
    // ---------------------------------------------------------
    function updatePitch() {
        if (!workletNode) return;
        workletNode.port.postMessage({
            message: "SET_PIPE_PROP",
            detail: { name: "pitchSemitones", value: pitchSemitones }
        });
    }

    function updateTempo() {
        if (!workletNode) return;
        workletNode.port.postMessage({
            message: "SET_PIPE_PROP",
            detail: { name: "tempo", value: tempo }
        });
    }

    // ---------------------------------------------------------
    // TIMELINE
    // ---------------------------------------------------------
    function updateTimeline(seconds) {
        if (!currentBuffer) return;

        const duration = currentBuffer.duration;
        ui.timeCurrent.textContent = format(seconds);
        ui.timeTotal.textContent = format(duration);
        ui.timeline.value = (seconds / duration) * 100;
    }

    function scrubTimeline() {
        if (!currentBuffer || !workletNode) return;

        const percent = ui.timeline.value / 100;
        const newPos = percent * currentBuffer.length;

        workletNode.port.postMessage({
            message: "SET_FILTER_PROP",
            detail: { name: "sourcePosition", value: newPos }
        });
    }

    function format(t) {
        const m = Math.floor(t / 60);
        const s = Math.floor(t % 60).toString().padStart(2, "0");
        return `${m}:${s}`;
    }

    // ---------------------------------------------------------
    // PLAYLIST
    // ---------------------------------------------------------
    function renderPlaylist() {
        ui.playlistContainer.innerHTML = "";

        playlist.forEach((track, i) => {
            const item = document.createElement("div");
            item.className = "playlist-item";
            item.textContent = track.title;

            if (i === currentIndex) item.classList.add("active");

            item.addEventListener("click", () => loadTrack(i));

            ui.playlistContainer.appendChild(item);
        });
    }
}
