$UD.connect('com.ulanzi.ulanzistudio.opnsense.traffic');

const form = document.getElementById('property-inspector');

function saveSettings() {
  const params = Utils.getFormValue('#property-inspector');
  params.insecure_tls = document.getElementById('insecure_tls').checked;
  $UD.sendParamFromPlugin(params);
}

$UD.onAdd((message) => {
  const param = message.param || {};
  Utils.setFormValue(param, '#property-inspector');
  if (typeof param.insecure_tls !== 'undefined') {
    document.getElementById('insecure_tls').checked =
      param.insecure_tls === true ||
      param.insecure_tls === 'true' ||
      param.insecure_tls === 'on' ||
      param.insecure_tls === '1';
  }
});

form.addEventListener('change', saveSettings);
form.addEventListener('input', () => {
  clearTimeout(window.__opnSaveTimer);
  window.__opnSaveTimer = setTimeout(saveSettings, 350);
});
