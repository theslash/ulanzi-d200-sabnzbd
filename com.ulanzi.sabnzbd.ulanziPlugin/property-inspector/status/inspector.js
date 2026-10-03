$UD.connect('com.ulanzi.ulanzistudio.sabnzbd.status');

const form = document.getElementById('property-inspector');

function saveSettings() {
  const params = Utils.getFormValue('#property-inspector');
  params.show_job_name = document.getElementById('show_job_name').checked;
  $UD.sendParamFromPlugin(params);
}

$UD.onAdd((message) => {
  const param = message.param || {};
  Utils.setFormValue(param, '#property-inspector');
  if (typeof param.show_job_name !== 'undefined') {
    document.getElementById('show_job_name').checked =
      param.show_job_name === true ||
      param.show_job_name === 'true' ||
      param.show_job_name === 'on' ||
      param.show_job_name === '1';
  }
});

form.addEventListener('change', saveSettings);
form.addEventListener('input', () => {
  clearTimeout(window.__sabSaveTimer);
  window.__sabSaveTimer = setTimeout(saveSettings, 350);
});
