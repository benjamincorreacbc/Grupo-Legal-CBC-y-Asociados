function renderLanding() {
  const servicesList = document.getElementById('servicesList');
  if (servicesList && !servicesList.children.length) {
    servicesList.innerHTML = `
      <div class="service-card">Litigación civil y comercial</div>
      <div class="service-card">Derecho laboral</div>
      <div class="service-card">Asesoría corporativa</div>
      <div class="service-card">Compliance y auditorías</div>
    `;
  }
}

renderLanding();
