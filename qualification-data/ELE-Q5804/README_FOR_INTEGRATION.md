# SkillSetu — ELE/Q5804 Dataset Integration Notes

## 1. Purpose

This package contains draft datasets prepared for the SkillSetu Recognition of Prior Learning (RPL) assessment project for the Electrician qualification, code ELE/Q5804, NSQF Level 4.

The application team should treat this package as assessment data for integration and testing, not as an approved certification engine.

## 2. Package contents

* `07_ELE_Q5804_Official_Source/ele_q5804_nos_pc_dataset.json` — qualification components and performance criteria extracted from the supplied qualification file.
* `07_ELE_Q5804_Official_Source/ele_q5804_qualification_summary.json` — qualification metadata, training hours, credits and assessment notes.
* `07_ELE_Q5804_Official_Source/ele_q5804_task_nos_mapping.json` — proposed practical task-to-NOS mappings.
* `08_ELE_Q5804_Viva_Question_Bank/ele_q5804_viva_questions.json` — 30 draft viva questions and suggested answers.
* `09_ELE_Q5804_Practical_Assessment/ele_q5804_practical_assessment.json` — 8 draft practical tasks and a prototype scoring scale.
* `10_ELE_Q5804_Assessor_Consistency_Tests/ele_q5804_assessor_consistency_tests.json` — 12 synthetic test specifications.
* `ele_q5804_dataset_register.json` — dataset inventory and known issues.
* `QFile_Electrician.pdf` — supplied qualification source, if included in the package.

## 3. Qualification components

* `ELE/N5806` — Planning, Design & Installation of Electrical and Electronic Sub System.
* `ELE/N5805` — Testing, Commissioning, Maintenance, Fault finding & Repair.
* `DGT/VSQ/N0102` — Employability Skills.
* `ELE/N1002` — Apply health and safety practices at workplace.

## 4. Important limitations

* The current validity of the qualification has not been verified.
* Proposed task-to-NOS mappings are not official mappings.
* The task-to-PC links remain unverified.
* Viva questions, suggested answers and practical rubrics require qualified assessor review.
* The source qualification file contains conflicting statements about the 70% pass requirement. Do not implement an inferred pass threshold.
* Assessor consistency tests are specifications only; they have not been executed.
* Do not use this package alone to make official competency, pass/fail or certification decisions.

## 5. Integration recommendations

* Load JSON files as versioned data, not executable code.
* Preserve qualification codes, NOS codes, task IDs and question IDs.
* Keep provisional and review statuses visible in the application.
* Do not automatically convert missing scores into zero or a pass.
* Keep scoring thresholds configurable and disabled until approved.
* Validate input data and preserve assessment audit trails.
* Keep synthetic test cases separate from real candidate records.
* Apply appropriate access controls to worker information and assessment evidence.

## 6. Suggested next steps for the application team

1. Validate all JSON files against a defined schema.
2. Import qualification components and draft question/task banks.
3. Review all mappings with a qualified assessor.
4. Implement and execute automated consistency tests.
5. Confirm current qualification validity and the approved assessment rules before production use.

**Package status:** Draft — for integration and review only.
