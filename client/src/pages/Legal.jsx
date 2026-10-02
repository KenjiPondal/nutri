import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const MEDICAL_DISCLAIMER =
  'Nutri gives general nutrition guidance, not medical advice. It is not a medical device and does not diagnose or treat any condition. ' +
  'Talk to a doctor or registered dietitian before changing your diet, especially if you are pregnant or breastfeeding, under 18, ' +
  'have a medical condition, take medication, or have a history of disordered eating.';

/** Public page: disclaimer, privacy summary, data sources/attribution. */
export default function Legal() {
  const { user } = useAuth();
  return (
    <div className="legal">
      <Link className="link" to={user ? '/' : '/login'}>‹ Back</Link>
      <h1>Legal & privacy</h1>
      <p className="dim small">Nutri alpha · last updated October 2, 2026</p>

      <section>
        <h3>Not medical advice</h3>
        <p>{MEDICAL_DISCLAIMER}</p>
        <p>Calorie targets, the Fuel score and coaching tips are estimates based on the food you log and data from your wearable. They can be wrong.
          Weight goals are capped at a conservative pace and never set intake below 1,200 kcal, but they are not a substitute for professional care.
          If you feel unwell, stop and seek medical help.</p>
      </section>

      <section>
        <h3>Private alpha</h3>
        <p>Nutri is an invite-only test with a handful of people. Features may change, break, or be removed, and data could be lost. Don't rely on it as your only record.</p>
      </section>

      <section>
        <h3>Your data</h3>
        <ul>
          <li><b>What we store:</b> your name and email, a hashed password, the food you log, meals and goals you create, weigh-ins, and, if you connect it, your WHOOP data (recovery, sleep, strain, workouts).</li>
          <li><b>Why:</b> only to show you your own dashboards and coaching. We don't sell it, share it, advertise with it, or train AI on it.</li>
          <li><b>Security:</b> passwords are hashed (bcrypt); WHOOP access tokens are encrypted at rest; all traffic is HTTPS.</li>
          <li><b>Your control:</b> export everything or permanently delete your account any time from the account menu. Deleting also revokes Nutri's WHOOP access.</li>
          <li><b>Shared food database:</b> products you add (name, brand, barcode, nutrition) are visible to other Nutri users, without your name.</li>
        </ul>
      </section>

      <section>
        <h3>Services we use</h3>
        <ul>
          <li><b>WHOOP</b>: we read your data through WHOOP's official API, only after you authorize it. Nutri is not affiliated with or endorsed by WHOOP.</li>
          <li><b>Open Food Facts</b>: when you search brands or scan an unknown barcode, the search text or barcode (nothing about you) is sent to Open Food Facts.</li>
          <li><b>Hosting</b>: Render (app) and MongoDB Atlas (database).</li>
        </ul>
      </section>

      <section id="data-sources">
        <h3>Food data sources</h3>
        <ul>
          <li>Branded products: <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a>, available under the{' '}
            <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">Open Database License (ODbL)</a>. Individual contents under the Database Contents License.</li>
          <li>Generic foods: <a href="https://fdc.nal.usda.gov" target="_blank" rel="noreferrer">USDA FoodData Central</a> (SR Legacy, FNDDS), public domain.</li>
          <li>Processing levels (NOVA) are taken from Open Food Facts where available, otherwise estimated by Nutri and may be inaccurate.</li>
        </ul>
      </section>

      <section>
        <h3>Contact</h3>
        <p>Questions or deletion requests: <a href="mailto:pondaljuan@gmail.com">pondaljuan@gmail.com</a></p>
      </section>
    </div>
  );
}
