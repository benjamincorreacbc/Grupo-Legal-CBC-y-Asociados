import { requireSessionOrRedirect, signOutAndGoLogin } from './auth.js';
import {
  createCase,
  listCases,
  uploadCaseDocument,
  createMeeting,
  createContact,
  addOffice,
} from './data.js';

const session = await requireSessionOrRedirect('./login.html');

function qs(id) {
  return document.getElementById(id);
}

function toggleDisplay(id) {
  const el = qs(id);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

const modules = Array.from(document.querySelectorAll('.module'));
function switchModule(id) {
  modules.forEach((module) => {
    module.style.display = module.id === id ? 'block' : 'none';
  });
}

window.switchModule = switchModule;

function logout() {
  signOutAndGoLogin('./login.html');
}
window.logout = logout;

window.toggleAddCaseForm = () => toggleDisplay('addCaseContainer');
window.toggleAddDocumentForm = () => toggleDisplay('addDocumentContainer');
window.toggleAddEventForm = () => toggleDisplay('addEventContainer');
window.toggleAddDirectoryForm = () => toggleDisplay('addDirectoryContainer');
window.toggleAddClientForm = () => toggleDisplay('addClientContainer');
window.toggleAddGlobalDocForm = () => toggleDisplay('addGlobalDocContainer');
window.toggleAddCaseActForm = () => toggleDisplay('addActContainer');
window.toggleAddLinkForm = () => toggleDisplay('addLinkContainer');
window.toggleAddAlertForm = () => toggleDisplay('addAlertContainer');
window.toggleBookingForm = () => toggleDisplay('bookingFormContainer');
window.backToCases = () => switchModule('cases');

async function refreshCases() {
  const list = qs('casesList');
  if (!list) return;
  try {
    const cases = await listCases();
    if (!cases || !cases.length) {
      list.innerHTML = '<p>No hay causas registradas.</p>';
      return;
    }
    list.innerHTML = cases.map((item) => `
      <article class="card">
        <h4>${item.name ?? 'Causa sin nombre'}</h4>
        <p><strong>Cliente:</strong> ${item.client_id ?? '—'}</p>
        <p><strong>RIT:</strong> ${item.rit ?? '—'}</p>
        <p><strong>Estado:</strong> ${item.status ?? '—'}</p>
      </article>
    `).join('');
  } catch (error) {
    console.error('No se pudieron listar las causas', error);
    list.innerHTML = '<p class="error">No se pudo cargar la información de causas.</p>';
  }
}

const addCaseBtn = qs('addCaseBtn');
if (addCaseBtn) {
  addCaseBtn.addEventListener('click', () => toggleDisplay('addCaseModal'));
}

const showAddCaseBtn = qs('showAddCaseBtn');
if (showAddCaseBtn) {
  showAddCaseBtn.addEventListener('click', () => toggleDisplay('addCaseContainer'));
}

const addCaseForm = qs('addCaseForm');
if (addCaseForm) {
  addCaseForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      name: qs('caseName')?.value?.trim() ?? '',
      client_id: qs('caseClient')?.value ?? null,
      rit: qs('caseNumber')?.value?.trim() ?? null,
      category: qs('caseCategory')?.value ?? null,
      status: qs('caseState')?.value ?? 'iniciado',
      tags: qs('caseTags')?.value ?? null,
      description: qs('caseDescription')?.value ?? '',
    };
    try {
      await createCase(payload);
      addCaseForm.reset();
      toggleDisplay('addCaseContainer');
      alert('Causa creada correctamente');
      await refreshCases();
    } catch (error) {
      console.error(error);
      alert(error.message || 'No se pudo crear la causa');
    }
  });
}

const addDocumentForm = qs('addDocumentForm');
if (addDocumentForm) {
  addDocumentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const caseId = qs('caseSelect')?.value || qs('docCase')?.value || qs('caseId')?.value || qs('caseTitle')?.dataset?.caseId;
    const fileInput = qs('docFile');
    const file = fileInput?.files?.[0] ?? null;
    if (!caseId) {
      alert('Selecciona una causa');
      return;
    }
    if (!file) {
      alert('Adjunta un archivo');
      return;
    }
    try {
      await uploadCaseDocument({
        caseId,
        file,
        visibleCliente: qs('docVisible')?.checked ?? false,
      });
      addDocumentForm.reset();
      toggleDisplay('addDocumentContainer');
      alert('Documento agregado');
    } catch (error) {
      console.error(error);
      alert(error.message || 'No se pudo subir el documento');
    }
  });
}

const uploadDocForm = qs('uploadDocForm');
if (uploadDocForm) {
  uploadDocForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const caseId = qs('docCase')?.value || qs('globalDocCase')?.value;
    const fileInput = uploadDocForm.querySelector('input[type="file"]');
    const file = fileInput?.files?.[0] ?? null;
    if (!caseId) {
      alert('Selecciona una causa');
      return;
    }
    if (!file) {
      alert('Adjunta un archivo');
      return;
    }
    try {
      await uploadCaseDocument({
        caseId,
        file,
        visibleCliente: uploadDocForm.querySelector('#docVisibleCliente')?.checked ?? false,
      });
      uploadDocForm.reset();
      alert('Documento subido');
    } catch (error) {
      console.error(error);
      alert(error.message || 'No se pudo subir el documento');
    }
  });
}

const addEventBtn = qs('addEventBtn');
if (addEventBtn) {
  addEventBtn.addEventListener('click', () => toggleDisplay('addEventContainer'));
}

const addEventForm = qs('addEventForm');
if (addEventForm) {
  addEventForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const type = qs('evType')?.value || (qs('eventCase')?.value ? 'case' : 'general');
    const title = qs('eventTitle')?.value?.trim() ?? qs('evTitle')?.value?.trim() ?? '';
    const description = qs('evDesc')?.value?.trim() ?? '';
    const startsAt = qs('eventStart')?.value || qs('evStart')?.value;
    const endsAt = qs('eventEnd')?.value || qs('evEnd')?.value;
    const caseId = type === 'case' ? (qs('eventCase')?.value || qs('evCase')?.value) : null;
    const participantsSelect = qs('eventParticipants') || qs('evParticipants');
    const participants = participantsSelect ? Array.from(participantsSelect.selectedOptions).map((opt) => opt.value) : [];

    try {
      await createMeeting({
        type,
        caseId: caseId || null,
        title,
        description,
        startsAt,
        endsAt,
        participants,
      });
      addEventForm.reset();
      toggleDisplay('addEventContainer');
      alert('Evento creado');
    } catch (error) {
      console.error(error);
      alert(error.message || 'No se pudo crear el evento');
    }
  });
}

const addDirectoryForm = qs('addDirectoryForm');
if (addDirectoryForm) {
  addDirectoryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      type: qs('dirType')?.value ?? 'person',
      name: qs('dirName')?.value?.trim() ?? '',
      surname: qs('dirSurname')?.value?.trim() ?? '',
      state: qs('dirState')?.value?.trim() ?? '',
      address: qs('dirAddress')?.value?.trim() ?? '',
      phone: qs('dirPhone')?.value?.trim() ?? '',
      route: qs('dirRoute')?.value?.trim() ?? '',
      tags: qs('dirTags')?.value?.trim() ?? '',
    };
    try {
      await createContact(payload);
      addDirectoryForm.reset();
      toggleDisplay('addDirectoryContainer');
      alert('Contacto guardado');
    } catch (error) {
      console.error(error);
      alert(error.message || 'No se pudo guardar el contacto');
    }
  });
}

const addOfficeBtn = qs('addOfficeBtn');
if (addOfficeBtn) {
  addOfficeBtn.addEventListener('click', () => toggleDisplay('addOfficeModal'));
}

const addOfficeForm = qs('addOfficeForm');
if (addOfficeForm) {
  addOfficeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = qs('offName')?.value?.trim() ?? '';
    const address = qs('offAddr')?.value?.trim() ?? '';
    try {
      await addOffice({ name, address });
      addOfficeForm.reset();
      toggleDisplay('addOfficeModal');
      alert('Oficina agregada');
    } catch (error) {
      console.error(error);
      alert(error.message || 'No se pudo agregar la oficina');
    }
  });
}

const logoutBtn = qs('logoutBtn') || qs('nav-logout');
if (logoutBtn) {
  logoutBtn.addEventListener('click', (event) => {
    event.preventDefault();
    if (confirm('¿Seguro que desea cerrar sesión?')) {
      logout();
    }
  });
}

switchModule('home');
refreshCases();

export default {};
