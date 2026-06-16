/**
 * GESTIÓN DINÁMICA DEL MAPA TPV
 * Este archivo se encarga de renderizar el mapa de mesas activo en la pantalla principal.
 */
(async function () {
  const mount = document.getElementById("tpvMapMount");
  if (!mount) return;

  function basePath() {
    const m = window.location.pathname.match(/^\/([a-z]{2})(\/|$)/i);
    return m ? `/${m[1]}` : "";
  }
  const BASE = basePath();
  let operadorConfirmadoEnMapa = false;
  let operadorPromise = null;

  function cajaListaParaOperar() {
    return window.TPV_DIA_ABIERTO === true && window.TPV_SESION_ABIERTA === true;
  }

  async function pedirOperadorMapa() {
    if (!window.TPVOperador || !cajaListaParaOperar()) return null;
    if (operadorConfirmadoEnMapa && window.TPVOperador.current()) {
      return window.TPVOperador.current();
    }
    if (!operadorPromise) {
      operadorPromise = window.TPVOperador.require({
        title: "Usuario TPV",
        hint: "Selecciona el usuario antes de entrar en una mesa.",
        allowCancel: false
      }).then((operador) => {
        if (operador) operadorConfirmadoEnMapa = true;
        return operador;
      }).finally(() => {
        operadorPromise = null;
      });
    }
    return operadorPromise;
  }

  // ── SVGs inline por tipo ──────────────────────────────────────────────────

  /**
   * Genera el SVG inline para cada tipo de elemento del mapa.
   * Los SVGs usan colores semitransparentes para adaptarse a cualquier suelo.
   */
  let _svgUid = 0;

  function getItemSVG(type) {
    const uid   = ++_svgUid;
    const oak   = "/static/ui/img/texturas_mapa/oak_veneer_01_diff_1k.jpg";
    const tableShine = "rgba(255,255,255,0.10)";
    const tableEdge  = "rgba(255,255,255,0.08)";

    switch (type) {
      case "mesa_normal":
        return `<svg viewBox="0 0 70 70" width="70" height="70" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <clipPath id="cp-${uid}">
              <rect x="2" y="2" width="66" height="66" rx="13"/>
            </clipPath>
          </defs>
          <image class="mesa-surface" href="${oak}" x="2" y="2" width="66" height="66"
                 preserveAspectRatio="xMidYMid slice" clip-path="url(#cp-${uid})"/>
          <rect x="6" y="6" width="26" height="10" rx="4" fill="${tableShine}"/>
          <rect x="2" y="2" width="66" height="66" rx="13" fill="none" stroke="${tableEdge}" stroke-width="1.5"/>
        </svg>`;

      case "mesa_grande":
        return `<svg viewBox="0 0 140 70" width="140" height="70" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <clipPath id="cp-${uid}">
              <rect x="2" y="2" width="136" height="66" rx="13"/>
            </clipPath>
          </defs>
          <image class="mesa-surface" href="${oak}" x="2" y="2" width="136" height="66"
                 preserveAspectRatio="xMidYMid slice" clip-path="url(#cp-${uid})"/>
          <rect x="8" y="8" width="40" height="10" rx="4" fill="${tableShine}"/>
          <rect x="2" y="2" width="136" height="66" rx="13" fill="none" stroke="${tableEdge}" stroke-width="1.5"/>
        </svg>`;

      case "taburete":
        return `<img src="/static/ui/img/map_icons/Taburete TPV.svg"
                     style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill"
                     draggable="false" alt="">`;

      case "llevar":
        return `<img src="/static/ui/img/map_icons/take-away-svgrepo-com.svg"
                     style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill"
                     draggable="false" alt="">`;

      case "barra":
        return `<img src="/static/ui/img/map_icons/Barra TPV.svg"
                     style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill"
                     draggable="false" alt="">`;

      case "columna":
        return `<img src="/static/ui/img/map_icons/Columna TPV.svg"
                     style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill"
                     draggable="false" alt="">`;

      case "cristal_fino":
        return `<img src="/static/ui/img/map_icons/Cristal fino_TPV.svg"
                     style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill"
                     draggable="false" alt="">`;

      case "cristal_gordo":
        return `<img src="/static/ui/img/map_icons/Cristal gordo_TPV.svg"
                     style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill"
                     draggable="false" alt="">`;

      case "esquina_muro":
        return `<img src="/static/ui/img/map_icons/Esquna muro TPV.svg"
                     style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill"
                     draggable="false" alt="">`;

      case "lavamanos":
        return `<img src="/static/ui/img/map_icons/Lavamanos TPV.svg"
                     style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill"
                     draggable="false" alt="">`;

      case "maceton":
        return `<img src="/static/ui/img/map_icons/MAcetón_TPV.svg"
                     style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill"
                     draggable="false" alt="">`;

      case "muro":
        return `<img src="/static/ui/img/map_icons/Muro TPV.svg"
                     style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill"
                     draggable="false" alt="">`;

      case "papelera":
        return `<img src="/static/ui/img/map_icons/PapeleraoJabón_TPV.svg"
                     style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill"
                     draggable="false" alt="">`;

      case "puerta":
        return `<img src="/static/ui/img/map_icons/Puerta_TPV.svg"
                     style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill"
                     draggable="false" alt="">`;

      case "wc":
        return `<img src="/static/ui/img/map_icons/WC TPV.svg"
                     style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill"
                     draggable="false" alt="">`;

      case "planta":
        // Mismo icono que usa el editor (MAP_SKINS.planta), para que se vea igual.
        return `<img src="/static/ui/img/map_icons/Maceta_TPV.svg"
                     style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill"
                     draggable="false" alt="">`;

      default:
        return null;
    }
  }

  // ── Escala ────────────────────────────────────────────────────────────────

  function fitScale(mapW, mapH) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return Math.min(vw / mapW, vh / mapH);
  }

  function clearMount() {
    mount.innerHTML = "";
  }

  // Si no hay mapa activo configurado
  if (!window.ACTIVE_MAP_ID) {
    mount.innerHTML = `
      <div style="padding:16px">
        <p>No hay ningún mapa activo.</p>
        <a class="btn" href="${BASE}/config/maps/">Ir a mapas</a>
      </div>
    `;
    return;
  }

  try {
    const res = await fetch(`${BASE}/api/maps/${window.ACTIVE_MAP_ID}/`);
    if (!res.ok) throw new Error(await res.text());
    const map = await res.json();

    clearMount();

    // ── Aplicar suelo ───────────────────────────────────────────────────────
    const floor = map.floor || "dark";
    // Limpiar clases de suelo anteriores y aplicar la nueva
    mount.className = mount.className.replace(/\bfloor--\S+/g, "").trim();
    mount.classList.add(`floor--${floor}`);

    const world = document.createElement("div");
    world.className = "tpvWorld";
    mount.appendChild(world);

    const mapW = Number(map.size?.w || 1920);
    const mapH = Number(map.size?.h || 1080);

    /**
     * Dibuja los elementos del mapa con SVGs inline.
     */
    function render() {
      world.innerHTML = "";

      const scale = fitScale(mapW, mapH);
      world.style.width  = mapW + "px";
      world.style.height = mapH + "px";
      world.style.transform = `scale(${scale})`;

      const RESIZABLE = new Set([
        "barra", "planta", "columna", "cristal_fino", "cristal_gordo",
        "esquina_muro", "lavamanos", "maceton", "muro", "papelera", "puerta", "wc",
      ]);
      const BASE_SIZES = {
        mesa_normal: [70,70], mesa_grande: [140,70], taburete: [54,54],
        llevar: [58,58], planta: [35,35], barra: [40,200],
        columna: [42,41], cristal_fino: [13,210], cristal_gordo: [42,210],
        esquina_muro: [56,50], lavamanos: [45,130], maceton: [45,160],
        muro: [220,40], papelera: [40,35], puerta: [70,67], wc: [50,85],
      };

      for (const it of (map.items || [])) {
        const el = document.createElement("div");
        el.className = `tpvItem ${it.type || ""}`.trim();

        el.style.left = (it.x || 0) + "px";
        el.style.top  = (it.y || 0) + "px";

        // Tamaño personalizado para elementos decorativos
        if (RESIZABLE.has(it.type) && (it.data?.w || it.data?.h)) {
          const base = BASE_SIZES[it.type] || [70, 70];
          el.style.width  = (it.data.w ?? base[0]) + "px";
          el.style.height = (it.data.h ?? base[1]) + "px";
        }

        const rot = Number(it.rotation);
        const rotDeg = Number.isFinite(rot) ? rot : 0;
        el.style.transform = `rotate(${rotDeg}deg)`;

        // SVG inline del elemento
        const svg = getItemSVG(it.type);
        if (svg) el.innerHTML = svg;

        // Etiqueta con el número de mesa (encima del SVG)
        // Contrarrotamos la etiqueta para que el número siempre se vea
        // recto, igual que en el editor (.item__label usa --rot al revés).
        const numero = String(it.data?.numero ?? "").trim();
        if (numero) {
          const lab = document.createElement("div");
          lab.className = "tpvLabel";
          lab.textContent = numero;
          lab.style.transform = `rotate(${-rotDeg}deg)`;
          el.appendChild(lab);
        }

        // Clic en mesas numeradas → abre comanda
        if ((it.type === "mesa_normal" || it.type === "mesa_grande") && numero) {
          el.style.cursor = "pointer";
          el.addEventListener("click", async () => {
            const operador = await pedirOperadorMapa();
            if (!operador && cajaListaParaOperar()) return;
            window.location.href = `${BASE}/tpv/mesa/${encodeURIComponent(numero)}/`;
          });
        }

        world.appendChild(el);
      }
    }

    render();
    window.addEventListener("resize", render);

    if (cajaListaParaOperar()) {
      setTimeout(() => { pedirOperadorMapa(); }, 0);
    } else {
      document.addEventListener("tpv:caja-ready", () => {
        setTimeout(() => { pedirOperadorMapa(); }, 0);
      }, { once: true });
    }

  } catch (err) {
    mount.innerHTML = `
      <div style="padding:16px">
        <p>Error cargando el mapa activo.</p>
        <pre style="white-space:pre-wrap">${String(err)}</pre>
        <a class="btn" href="${BASE}/config/maps/">Ir a mapas</a>
      </div>
    `;
    console.error(err);
  }
})();
