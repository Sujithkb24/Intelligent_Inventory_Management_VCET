def as_api_questions(questions):
    return [{
        "ambiguity_type": question.get("ambiguity_type"),
        "question": question.get("question"),
        "field": question.get("field"),
        "options": [{
            "id": option.get("id"),
            "label": option.get("label"),
            "score": option.get("score"),
        } for option in question.get("options", [])],
    } for question in questions or []]


def pending_questions(questions):
    return [{
        "ambiguity_type": question.get("ambiguity_type"),
        "question": question.get("question"),
        "field": question.get("field"),
        "options": [dict(option) for option in question.get("options", [])],
    } for question in questions or []]


def summary(interpretations, questions, refused=False):
    parts = list(interpretations or [])
    for question in questions or []:
        options = ", ".join(f"{option.get('label')} ({option.get('id')})" for option in question.get("options", []))
        parts.append(f"{question.get('question')} Options: {options}.")
    if refused and not parts:
        parts.append("I could not match that request to a valid ID.")
    return " ".join(parts)
