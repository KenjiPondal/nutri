import { useEffect, useState } from 'react';
import { errMsg } from '../services/api';
import { listDishes, deleteDish } from '../services/dishes';
import DishEditor from '../components/DishEditor';
import LogDish from '../components/LogDish';

/** Small sheet wrapper used for the editor and the log/plan flow. */
export function Sheet({ title, onClose, children }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><h3>{title}</h3><button className="link" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div>
  );
}

export function DishCard({ d, onLog, onEdit }) {
  const q = d.quality || {};
  return (
    <div className="dish-card">
      <div className="dish-main" onClick={onEdit}>
        <strong>{d.name}</strong>
        <div className="muted small">
          {d.perPortion.calories} kcal · P {Math.round(d.perPortion.protein)} · C {Math.round(d.perPortion.carbs)} · F {Math.round(d.perPortion.fat)}
          {d.portions > 1 && <span className="dim"> · per portion of {d.portions}</span>}
        </div>
        <div className="dish-tags">
          {q.plantServings >= 1 && <span className="chip nova1">{q.plantServings} plant serv.</span>}
          {q.upfShare != null && q.upfShare >= 0.3 && <span className="chip nova4">{Math.round(q.upfShare * 100)}% ultra-processed</span>}
          {q.wholeShare != null && q.wholeShare >= 0.8 && <span className="chip nova1">Whole foods</span>}
          {d.timesLogged > 0 && <span className="dim small">Logged {d.timesLogged}×</span>}
        </div>
      </div>
      <button className="btn small" onClick={onLog}>Log / plan</button>
    </div>
  );
}

export default function Meals() {
  const [dishes, setDishes] = useState(null);
  const [editing, setEditing] = useState(null); // dish or {} for new
  const [logging, setLogging] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = () => listDishes().then(setDishes).catch(e => setError(errMsg(e)));
  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="page-head">
        <h2>Meals</h2>
        <button className="btn small" onClick={() => setEditing({})}>+ New meal</button>
      </div>
      <p className="muted small" style={{ marginTop: '-.4rem', marginBottom: '.8rem' }}>
        Save dishes you eat often, or a meal-prep batch, and log them in one tap, even for the whole week.
      </p>
      {error && <div className="error">{error}</div>}
      {notice && <div className="info" onClick={() => setNotice('')}>{notice}</div>}

      {dishes && !dishes.length && (
        <div className="card empty">
          <p><strong>No saved meals yet</strong></p>
          <p className="muted small">Build one from ingredients here, or log a meal and tap “Save as meal” on the Log page.</p>
          <button className="btn" style={{ marginTop: '.9rem' }} onClick={() => setEditing({})}>Create your first meal</button>
        </div>
      )}
      <div className="dish-list">
        {dishes?.map(d => <DishCard key={d._id} d={d} onLog={() => setLogging(d)} onEdit={() => setEditing(d)} />)}
      </div>

      {editing && (
        <Sheet title={editing._id ? 'Edit meal' : 'New meal'} onClose={() => setEditing(null)}>
          <DishEditor initial={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
          {editing._id && (
            <button className="link danger-link" onClick={async () => {
              if (!confirm(`Delete “${editing.name}”? Meals you already logged stay in your history.`)) return;
              await deleteDish(editing._id); setEditing(null); load();
            }}>Delete meal</button>
          )}
        </Sheet>
      )}
      {logging && (
        <Sheet title={logging.name} onClose={() => setLogging(null)}>
          <LogDish dish={logging} onCancel={() => setLogging(null)} onDone={({ days, planned }) => {
            setLogging(null); load();
            setNotice(days === 1 ? (planned ? 'Planned.' : 'Logged.') : `Added to ${days} days${planned ? ` (${planned} planned)` : ''}.`);
          }} />
        </Sheet>
      )}
    </div>
  );
}
