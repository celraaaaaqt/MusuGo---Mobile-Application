// Small promise-based modal: checkout.js calls collectCustomerInfo() and
// awaits it. Resolves with { name, email, contact } on Continue, or null
// if the customer backs out.

const customerInfoModal = document.getElementById("customer-info-modal");
const customerInfoForm = document.getElementById("customer-info-form");
const customerInfoBack = document.getElementById("customer-info-back");

const nameInput = document.getElementById("customer-name");
const emailInput = document.getElementById("customer-email");
const contactInput = document.getElementById("customer-contact");

let resolveCurrent = null;

export function collectCustomerInfo() {
  nameInput.value = "";
  emailInput.value = "";
  contactInput.value = "";

  customerInfoModal.classList.remove("hidden");
  customerInfoModal.classList.add("flex");

  setTimeout(() => nameInput.focus(), 50);

  return new Promise((resolve) => {
    resolveCurrent = resolve;
  });
}

function closeModal() {
  customerInfoModal.classList.add("hidden");
  customerInfoModal.classList.remove("flex");
}

customerInfoForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const contact = contactInput.value.trim();

  if (!name || !email || !contact) return;

  closeModal();
  resolveCurrent?.({ name, email, contact });
  resolveCurrent = null;
});

customerInfoBack.addEventListener("click", () => {
  closeModal();
  resolveCurrent?.(null);
  resolveCurrent = null;
});