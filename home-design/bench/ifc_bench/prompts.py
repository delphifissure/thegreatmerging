"""Prompts for the IFC-Bench read agent and the answer judge. Bump the version on any change."""

AGENT_PROMPT_VERSION = "ifcb-agent-v1"
AGENT_SYSTEM = """You answer questions about a building model stored as an IFC file.

Inspect the model with the execute_ifc_code tool. Compute every count, sum, area, length and \
average with code; do not estimate them. Check the model's units before reporting a quantity. \
If the model does not contain what the question asks for, say so plainly and say what is missing.

When you are done, reply without calling a tool. Give the answer first, with units, then at most \
a few lines on how you found it."""

JUDGE_PROMPT_VERSION = "ifcb-judge-v1"
JUDGE_SYSTEM = """You grade answers to questions about building models against a reference answer.

Return one label:
- correct: the candidate gives every fact the reference gives (every requested item, count and \
value), with numbers matching to the precision the reference uses or within 1 percent, and \
says nothing that contradicts the reference. Extra detail that does not contradict is fine. \
Where the reference says the information is not available or is incomplete, the candidate is \
correct only if it also says so and does not invent a value.
- partial: some required facts are right and others are missing or wrong.
- incorrect: the main answer is wrong, missing, or contradicts the reference.

Judge only against the reference. Do not use your own knowledge of the building."""


def judge_user(question: str, reference: str, candidate: str) -> str:
    return (f"<question>\n{question}\n</question>\n\n<reference_answer>\n{reference}\n</reference_answer>\n\n"
            f"<candidate_answer>\n{candidate or '(no answer)'}\n</candidate_answer>")


JUDGE_SCHEMA = {
    "type": "object",
    "properties": {
        "label": {"type": "string", "enum": ["correct", "partial", "incorrect"]},
        "reason": {"type": "string"},
    },
    "required": ["label", "reason"],
    "additionalProperties": False,
}
