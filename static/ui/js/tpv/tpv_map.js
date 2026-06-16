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
    const chairFill  = "rgba(200,165,110,0.55)";
    const tableShine = "rgba(255,255,255,0.10)";
    const tableEdge  = "rgba(255,255,255,0.08)";

    switch (type) {
      case "mesa_normal":
        return `<svg viewBox="0 0 70 70" width="70" height="70" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <clipPath id="cp-${uid}">
              <rect x="14" y="14" width="42" height="42" rx="9"/>
            </clipPath>
          </defs>
          <rect x="17" y="3"  width="36" height="11" rx="4" fill="${chairFill}"/>
          <rect x="17" y="56" width="36" height="11" rx="4" fill="${chairFill}"/>
          <rect x="3"  y="17" width="11" height="36" rx="4" fill="${chairFill}"/>
          <rect x="56" y="17" width="11" height="36" rx="4" fill="${chairFill}"/>
          <image class="mesa-surface" href="${oak}" x="14" y="14" width="42" height="42"
                 preserveAspectRatio="xMidYMid slice" clip-path="url(#cp-${uid})"/>
          <rect x="18" y="18" width="18" height="8" rx="3" fill="${tableShine}"/>
          <rect x="16" y="16" width="38" height="38" rx="8" fill="none" stroke="${tableEdge}" stroke-width="1.5"/>
        </svg>`;

      case "mesa_grande":
        return `<svg viewBox="0 0 140 70" width="140" height="70" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <clipPath id="cp-${uid}">
              <rect x="14" y="14" width="112" height="42" rx="9"/>
            </clipPath>
          </defs>
          <rect x="17"  y="3"  width="30" height="11" rx="4" fill="${chairFill}"/>
          <rect x="55"  y="3"  width="30" height="11" rx="4" fill="${chairFill}"/>
          <rect x="93"  y="3"  width="30" height="11" rx="4" fill="${chairFill}"/>
          <rect x="17"  y="56" width="30" height="11" rx="4" fill="${chairFill}"/>
          <rect x="55"  y="56" width="30" height="11" rx="4" fill="${chairFill}"/>
          <rect x="93"  y="56" width="30" height="11" rx="4" fill="${chairFill}"/>
          <rect x="3"   y="17" width="11" height="36" rx="4" fill="${chairFill}"/>
          <rect x="126" y="17" width="11" height="36" rx="4" fill="${chairFill}"/>
          <image class="mesa-surface" href="${oak}" x="14" y="14" width="112" height="42"
                 preserveAspectRatio="xMidYMid slice" clip-path="url(#cp-${uid})"/>
          <rect x="18" y="18" width="32" height="8" rx="3" fill="${tableShine}"/>
          <rect x="16" y="16" width="108" height="38" rx="8" fill="none" stroke="${tableEdge}" stroke-width="1.5"/>
        </svg>`;

      case "taburete":
        return `<img src="/static/ui/img/map_icons/Taburete TPV.svg"
                     style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain"
                     draggable="false" alt="">`;

      case "llevar":
        return `<img src="/static/ui/img/map_icons/take-away-svgrepo-com.svg"
                     style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain"
                     draggable="false" alt="">`;

      case "barra":
        return `<img src="/static/ui/img/map_icons/Barra TPV.svg"
                     style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain"
                     draggable="false" alt="">`;

      case "planta":
        // Maceta simple (el SVG original tiene fondo, este es más limpio)
        return `<svg viewBox="0 0 35 35" xmlns="http://www.w3.org/2000/svg">
          <!-- Maceta -->
          <path d="M10 22 L12 30 L23 30 L25 22 Z" fill="rgba(160,100,50,0.7)"/>
          <!-- Tierra -->
          <ellipse cx="17.5" cy="22" rx="7.5" ry="2.5" fill="rgba(100,60,20,0.8)"/>
          <!-- Hoja izquierda -->
          <ellipse cx="11" cy="15" rx="6" ry="4" fill="rgba(60,160,60,0.8)"
                   transform="rotate(-30 11 15)"/>
          <!-- Hoja derecha -->
          <ellipse cx="24" cy="15" rx="6" ry="4" fill="rgba(50,140,50,0.8)"
                   transform="rotate(30 24 15)"/>
          <!-- Hoja central -->
          <ellipse cx="17.5" cy="11" rx="5" ry="7" fill="rgba(70,180,70,0.85)"/>
        </svg>`;

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

      const RESIZABLE = new Set(["barra", "planta"]);
      const BASE_SIZES = {
        mesa_normal: [70,70], mesa_grande: [140,70], taburete: [54,54],
        llevar: [58,58], planta: [35,35], barra: [40,200],
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
        el.style.transform = `rotate(${Number.isFinite(rot) ? rot : 0}deg)`;

        // SVG inline del elemento
        const svg = getItemSVG(it.type);
        if (svg) el.innerHTML = svg;

        // Etiqueta con el número de mesa (encima del SVG)
        const numero = String(it.data?.numero ?? "").trim();
        if (numero) {
          const lab = document.createElement("div");
          lab.className = "tpvLabel";
          lab.textContent = numero;
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
