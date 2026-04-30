/* 
  login.js
  Lógica de la pantalla de login (mostrar/ocultar contraseña, etc).
*/

(function setupPasswordToggle() {
  const toggle = document.getElementById("pwToggle");
  if (!toggle) return;

  const input = document.querySelector('input[name="password"]');
  const icon = document.getElementById("pwIcon");
  if (!input || !icon) return;

  const openIcon = "/static/ui/img/ojo_abierto.png";
  const closedIcon = "/static/ui/img/ojo_cerrado.png";
  let lastSelection = {
    start: input.value.length,
    end: input.value.length,
  };

  function rememberSelection() {
    if (document.activeElement !== input) return;
    lastSelection = {
      start: input.selectionStart ?? input.value.length,
      end: input.selectionEnd ?? input.value.length,
    };
  }

  ["input", "keyup", "click", "select", "focus"].forEach((eventName) => {
    input.addEventListener(eventName, rememberSelection);
  });

  ["mousedown", "pointerdown", "touchstart"].forEach((eventName) => {
    toggle.addEventListener(eventName, (event) => {
      rememberSelection();
      event.preventDefault();
    });
  });

  toggle.addEventListener("click", () => {
    const cursorStart = lastSelection.start ?? input.value.length;
    const cursorEnd = lastSelection.end ?? input.value.length;
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    icon.src = isHidden ? closedIcon : openIcon;
    input.focus();
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(cursorStart, cursorEnd);
      rememberSelection();
    });
  });
})();

(function setupAutocompleteOff() {
  const username = document.querySelector('input[name="username"]');
  const password = document.querySelector('input[name="password"]');
  if (username) username.setAttribute("autocomplete", "off");
  if (password) password.setAttribute("autocomplete", "new-password"); // Chrome/Edge often respect this more for passwords
})();
