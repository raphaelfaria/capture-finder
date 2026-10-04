// The legacy bridge as one script for the vm-based app suite (tests/legacy/test_app.cjs): it reads the
// data from window.CF_DATA, as the old app did, and defines the old globals on the global object.
import type { Capture, GearDef } from '../../shared/schema';
import { createCatalog } from '../data/catalog';
import { createStore } from '../state/store';
import { legacyApi } from './legacyBridge';

const data = (globalThis as unknown as { window: { CF_DATA: { gear: GearDef[]; captures: Capture[] } } }).window
  .CF_DATA;
const api = legacyApi(createStore(createCatalog(data)));
Object.defineProperties(globalThis, Object.getOwnPropertyDescriptors(api));
