import argparse
import json
import os

try:
    from datasets import Dataset
    from transformers import (
        AutoModelForCausalLM,
        AutoTokenizer,
        TrainingArguments,
        Trainer,
    )
    from peft import LoraConfig, get_peft_model
except ImportError as e:
    missing = str(e).split("'")[1]
    raise SystemExit(
        f"Missing required package: {missing}. Install dependencies from requirements.txt"
    )


def load_feedback_dataset(path):
    """Load feedback JSON and validate structure."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            records = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        raise SystemExit(f"Failed to load dataset: {e}")

    if not isinstance(records, list):
        raise SystemExit("Dataset JSON must be a list of objects")

    data = []
    for idx, record in enumerate(records):
        if not isinstance(record, dict):
            raise SystemExit(f"Record {idx} is not an object")
        if not record.get("prompt") or not record.get("completion"):
            raise SystemExit(f"Record {idx} missing required fields")
        data.append(record)

    return Dataset.from_list(data), data


def compute_adoption_rate(records):
    """Return fraction of records marked as adopted."""
    if not records:
        return 0.0
    adopted = sum(1 for r in records if r.get("adopted"))
    return adopted / len(records)


def main():
    parser = argparse.ArgumentParser(description="Fine-tune model with LoRA")
    parser.add_argument("dataset", help="Path to curated feedback dataset")
    parser.add_argument("model", help="Base model name")
    parser.add_argument("output", help="Directory to save LoRA adapter")
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--logging-steps", type=int, default=10)
    parser.add_argument("--save-steps", type=int, default=50)
    args = parser.parse_args()

    ds, records = load_feedback_dataset(args.dataset)
    try:
        tokenizer = AutoTokenizer.from_pretrained(args.model)
        model = AutoModelForCausalLM.from_pretrained(args.model)
    except Exception as e:
        raise SystemExit(f"Failed to load model or tokenizer: {e}")

    lora = LoraConfig(task_type="CAUSAL_LM", r=16, lora_alpha=32, lora_dropout=0.05)
    model = get_peft_model(model, lora)

    def tokenize(example):
        text = f"{example['prompt']} {example['completion']}"
        return tokenizer(
            text,
            max_length=512,
            padding="max_length",
            truncation=True,
        )

    tokenized = ds.map(tokenize, batched=True)

    if not os.path.exists(args.output):
        try:
            os.makedirs(args.output)
        except OSError as e:
            raise SystemExit(f"Cannot create output directory: {e}")
    if not os.access(args.output, os.W_OK):
        raise SystemExit("Output directory is not writable")

    training_args = TrainingArguments(
        output_dir=args.output,
        per_device_train_batch_size=args.batch_size,
        num_train_epochs=args.epochs,
        logging_steps=args.logging_steps,
        save_steps=args.save_steps,
    )

    trainer = Trainer(model=model, args=training_args, train_dataset=tokenized)
    trainer.train()
    model.save_pretrained(args.output)

    rate = compute_adoption_rate(records)
    print(f"Base adoption rate: {rate:.2%}")


if __name__ == "__main__":
    main()
