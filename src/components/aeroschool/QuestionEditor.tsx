'use client';

import React from 'react';
import {
  GripVertical, Trash2, Plus, ToggleLeft, ToggleRight,
  Type, AlignLeft, CircleDot, CheckSquare, List, Sliders,
} from 'lucide-react';

export interface Question {
  id: string;
  type: 'short_text' | 'paragraph' | 'radio' | 'checkbox' | 'dropdown' | 'linear_scale';
  title: string;
  description: string;
  required: boolean;
  options: string[];
  is_graded: boolean;
  points: number;
  correct_answers: string[];
  // Pour linear_scale
  scale_min?: number;
  scale_max?: number;
  scale_min_label?: string;
  scale_max_label?: string;
}

const QUESTION_TYPES: { value: Question['type']; label: string; icon: React.ElementType }[] = [
  { value: 'short_text', label: 'Texte court', icon: Type },
  { value: 'paragraph', label: 'Paragraphe', icon: AlignLeft },
  { value: 'radio', label: 'Choix unique', icon: CircleDot },
  { value: 'checkbox', label: 'Cases à cocher', icon: CheckSquare },
  { value: 'dropdown', label: 'Liste déroulante', icon: List },
  { value: 'linear_scale', label: 'Échelle linéaire', icon: Sliders },
];

interface Props {
  question: Question;
  onChange: (updated: Question) => void;
  onDelete: () => void;
}

export default function QuestionEditor({ question, onChange, onDelete }: Props) {
  const hasOptions = ['radio', 'checkbox', 'dropdown'].includes(question.type);
  const isScale = question.type === 'linear_scale';

  const update = (partial: Partial<Question>) => onChange({ ...question, ...partial });

  const updateOption = (idx: number, value: string) => {
    const opts = [...question.options];
    opts[idx] = value;
    update({ options: opts });
  };

  const addOption = () => update({ options: [...question.options, `Option ${question.options.length + 1}`] });
  const removeOption = (idx: number) => {
    const opts = question.options.filter((_, i) => i !== idx);
    const correct = question.correct_answers.filter((a) => opts.includes(a));
    update({ options: opts, correct_answers: correct });
  };

  const toggleCorrectAnswer = (opt: string) => {
    const isCorrect = question.correct_answers.includes(opt);
    if (question.type === 'radio' || question.type === 'dropdown') {
      update({ correct_answers: isCorrect ? [] : [opt] });
    } else {
      update({
        correct_answers: isCorrect
          ? question.correct_answers.filter((a) => a !== opt)
          : [...question.correct_answers, opt],
      });
    }
  };

  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 space-y-4">
      {/* Header : type + drag handle */}
      <div className="flex items-start gap-3">
        <GripVertical className="h-5 w-5 text-slate-500 mt-2 cursor-grab shrink-0" />
        <div className="flex-1 space-y-3">
          {/* Titre de la question */}
          <input
            type="text"
            value={question.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Titre de la question"
            className="w-full bg-transparent border-b border-slate-600 focus:border-sky-500 text-slate-100 text-lg py-1 outline-none transition-colors"
          />
          {/* Description optionnelle */}
          <input
            type="text"
            value={question.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="Description (aide optionnelle)"
            className="w-full bg-transparent border-b border-slate-700 focus:border-slate-500 text-slate-400 text-sm py-1 outline-none transition-colors"
          />
        </div>
        {/* Sélecteur de type */}
        <select
          value={question.type}
          onChange={(e) => {
            const newType = e.target.value as Question['type'];
            const needsOptions = ['radio', 'checkbox', 'dropdown'].includes(newType);
            update({
              type: newType,
              options: needsOptions && question.options.length === 0 ? ['Option 1'] : question.options,
              correct_answers: [],
            });
          }}
          className="bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm px-3 py-2 outline-none"
        >
          {QUESTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Options pour radio/checkbox/dropdown */}
      {hasOptions && (
        <div className="pl-8 space-y-2">
          {question.options.map((opt, idx) => (
            <div key={idx} className="flex items-center gap-2">
              {question.type === 'radio' && <CircleDot className="h-4 w-4 text-slate-500 shrink-0" />}
              {question.type === 'checkbox' && <CheckSquare className="h-4 w-4 text-slate-500 shrink-0" />}
              {question.type === 'dropdown' && <span className="text-slate-500 text-sm w-4 text-center shrink-0">{idx + 1}.</span>}
              <input
                type="text"
                value={opt}
                onChange={(e) => updateOption(idx, e.target.value)}
                className="flex-1 bg-transparent border-b border-slate-700 focus:border-slate-500 text-slate-200 text-sm py-1 outline-none"
              />
              {question.is_graded && (
                <button
                  type="button"
                  onClick={() => toggleCorrectAnswer(opt)}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                    question.correct_answers.includes(opt)
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                      : 'border-slate-600 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {question.correct_answers.includes(opt) ? 'Correcte' : 'Marquer'}
                </button>
              )}
              {question.options.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeOption(idx)}
                  className="text-slate-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addOption}
            className="flex items-center gap-1 text-sky-400 hover:text-sky-300 text-sm transition-colors"
          >
            <Plus className="h-4 w-4" />
            Ajouter une option
          </button>
        </div>
      )}

      {/* Échelle linéaire */}
      {isScale && (
        <div className="pl-8 space-y-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-slate-400 text-sm">De</label>
              <select
                value={question.scale_min ?? 0}
                onChange={(e) => update({ scale_min: parseInt(e.target.value) })}
                className="bg-slate-700 border border-slate-600 rounded text-slate-200 text-sm px-2 py-1"
              >
                {[0, 1].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-slate-400 text-sm">à</label>
              <select
                value={question.scale_max ?? 5}
                onChange={(e) => update({ scale_max: parseInt(e.target.value) })}
                className="bg-slate-700 border border-slate-600 rounded text-slate-200 text-sm px-2 py-1"
              >
                {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <input
              type="text"
              value={question.scale_min_label || ''}
              onChange={(e) => update({ scale_min_label: e.target.value })}
              placeholder="Label minimum (optionnel)"
              className="w-full bg-transparent border-b border-slate-700 focus:border-slate-500 text-slate-300 text-sm py-1 outline-none"
            />
            <input
              type="text"
              value={question.scale_max_label || ''}
              onChange={(e) => update({ scale_max_label: e.target.value })}
              placeholder="Label maximum (optionnel)"
              className="w-full bg-transparent border-b border-slate-700 focus:border-slate-500 text-slate-300 text-sm py-1 outline-none"
            />
          </div>
        </div>
      )}

      {/* Prévisualisation texte court / paragraphe */}
      {question.type === 'short_text' && (
        <div className="pl-8">
          <div className="border-b border-slate-700 text-slate-500 text-sm py-2">Texte de réponse courte</div>
        </div>
      )}
      {question.type === 'paragraph' && (
        <div className="pl-8">
          <div className="border border-slate-700 rounded-lg text-slate-500 text-sm p-3 h-16">Texte de réponse longue</div>
        </div>
      )}

      {/* Footer : toggles */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-700/50">
        <div className="flex items-center gap-4">
          {/* Obligatoire */}
          <button
            type="button"
            onClick={() => update({ required: !question.required })}
            className="flex items-center gap-1.5 text-sm transition-colors"
          >
            {question.required ? (
              <ToggleRight className="h-5 w-5 text-sky-400" />
            ) : (
              <ToggleLeft className="h-5 w-5 text-slate-500" />
            )}
            <span className={question.required ? 'text-sky-400' : 'text-slate-500'}>Obligatoire</span>
          </button>
          {/* Notée */}
          <button
            type="button"
            onClick={() => update({ is_graded: !question.is_graded, points: question.is_graded ? 0 : 1 })}
            className="flex items-center gap-1.5 text-sm transition-colors"
          >
            {question.is_graded ? (
              <ToggleRight className="h-5 w-5 text-amber-400" />
            ) : (
              <ToggleLeft className="h-5 w-5 text-slate-500" />
            )}
            <span className={question.is_graded ? 'text-amber-400' : 'text-slate-500'}>Notée</span>
          </button>
          {question.is_graded && (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                value={question.points}
                onChange={(e) => update({ points: Math.max(1, parseInt(e.target.value) || 1) })}
                className="w-14 bg-slate-700 border border-slate-600 rounded text-slate-200 text-sm px-2 py-1 text-center outline-none"
              />
              <span className="text-slate-400 text-sm">pts</span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="text-slate-500 hover:text-red-400 transition-colors p-1"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

export function createEmptyQuestion(): Question {
  return {
    id: crypto.randomUUID(),
    type: 'short_text',
    title: '',
    description: '',
    required: false,
    options: [],
    is_graded: false,
    points: 0,
    correct_answers: [],
  };
}
