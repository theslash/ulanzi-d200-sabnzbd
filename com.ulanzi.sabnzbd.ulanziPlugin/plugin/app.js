import { UlanziApi } from './actions/ulanzi-api/index.js';
import SABnzbdStatus from './actions/SABnzbdStatus.js';

const ACTION_CACHES = {};
const $UD = new UlanziApi();

$UD.connect('com.ulanzi.ulanzistudio.sabnzbd');
$UD.onConnected(() => {
  console.log('[SABnzbd] connected to UlanziStudio');
});

$UD.onAdd((jsn) => {
  const context = jsn.context;
  if (!ACTION_CACHES[context]) {
    ACTION_CACHES[context] = new SABnzbdStatus(context, $UD);
  }
  onSetSettings(jsn, 'init');
});

$UD.onSetActive((jsn) => {
  const instance = ACTION_CACHES[jsn.context];
  if (instance) instance.setActive(jsn.active);
});

$UD.onRun((jsn) => {
  const context = jsn.context;
  let instance = ACTION_CACHES[context];
  if (!instance) {
    ACTION_CACHES[context] = new SABnzbdStatus(context, $UD);
    instance = ACTION_CACHES[context];
    onSetSettings(jsn, 'init');
  }
  instance.run(jsn);
});

$UD.onClear((jsn) => {
  if (!jsn.param) return;
  for (const item of jsn.param) {
    const context = item.context;
    const instance = ACTION_CACHES[context];
    if (instance) instance.destroy();
    delete ACTION_CACHES[context];
  }
});

$UD.onParamFromApp((jsn) => onSetSettings(jsn));
$UD.onParamFromPlugin((jsn) => onSetSettings(jsn));

function onSetSettings(jsn, type) {
  const settings = jsn.param || {};
  const instance = ACTION_CACHES[jsn.context];
  if (!instance) return;
  // Empty params on first drop → still apply built-in defaults and start polling.
  if (Object.keys(settings).length === 0 && type !== 'init') return;
  instance.updateSettings(settings, type || 'update');
}
