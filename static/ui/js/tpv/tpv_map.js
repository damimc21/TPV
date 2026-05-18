/**
 * GESTIÓN DINÁMICA DEL MAPA TPV
 * Este archivo se encarga de renderizar el mapa de mesas activo en la pantalla principal.
 */
(async function () {
  const mount = document.getElementById("tpvMapMount");
  if (!mount) return;

  /**
   * Obtiene la base de la URL según el idioma actual.
   */
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

  /**
   * Define los tamaños por defecto según el tipo de elemento.
   */
  function getItemSize(type) {
    switch (type) {
      case "mesa_normal": return { w: 70, h: 70 };
      case "mesa_grande": return { w: 140, h: 70 };
      case "taburete": return { w: 54, h: 54 };
      case "llevar": return { w: 58, h: 58 };
      case "planta": return { w: 35, h: 35 };
      default: return { w: 70, h: 70 };
    }
  }

  /**
   * Ajusta la escala del mapa para que quepa en la ventana sin recortes.
   */
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

    const world = document.createElement("div");
    world.className = "tpvWorld";
    mount.appendChild(world);

    const mapW = Number(map.size?.w || 1920);
    const mapH = Number(map.size?.h || 1080);

    /**
     * Dibuja los elementos del mapa (mesas, taburetes, etc.)
     */
    function render() {
      world.innerHTML = "";

      const scale = fitScale(mapW, mapH);
      world.style.width = mapW + "px";
      world.style.height = mapH + "px";
      world.style.transform = `scale(${scale})`;

      for (const it of (map.items || [])) {
        const el = document.createElement("div");
        el.className = `tpvItem ${it.type || ""}`.trim();

        el.style.left = (it.x || 0) + "px";
        el.style.top = (it.y || 0) + "px";

        const rot = Number(it.rotation);
        el.style.transform = `rotate(${Number.isFinite(rot) ? rot : 0}deg)`;

        // Etiqueta con el número de mesa
        const numero = String(it.data?.numero ?? "").trim();
        if (numero) {
            const lab = document.createElement("div");
            lab.className = "tpvLabel";
            lab.textContent = numero;
            el.appendChild(lab);
        }

        // Acción al hacer clic: Abre la comanda de la mesa si es navegable
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
