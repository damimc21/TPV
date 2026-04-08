/* 
  login.js
  Lógica de la pantalla de login (mostrar/ocultar contraseña, etc).
*/

(function setupPasswordToggle(){
  const toggle = document.getElementById("pwToggle");
  if (!toggle) return;

  const input = document.querySelector('input[name="password"]');
  const icon = document.getElementById("pwIcon");
  if (!input || !icon) return;

  const openIcon = "/static/ui/img/ojo_abierto.png";
  const closedIcon = "/static/ui/img/ojo_cerrado.png";

  toggle.addEventListener("click", () => {
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    icon.src = isHidden ? closedIcon : openIcon;
  });
})();

(function setupAutocompleteOff(){
  const username = document.querySelector('input[name="username"]');
  const password = document.querySelector('input[name="password"]');
  if (username) username.setAttribute("autocomplete", "off");
  if (password) password.setAttribute("autocomplete", "new-password"); // Chrome/Edge often respect this more for passwords
})();