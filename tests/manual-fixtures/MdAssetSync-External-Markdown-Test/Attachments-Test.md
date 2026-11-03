# MdAssetSync Non-Image Attachment Test

## Expected links

[Text report](./attachments/report.txt)

[CSV report][table]

[table]: ./attachments/table.csv

[[./attachments/diagram.drawio|Open the diagram]]

![[./attachments/dataset.json]]

<a href="./attachments/archive-summary.json">Open the HTML-linked attachment</a>

## Links that must remain unchanged

[Remote report](https://example.com/remote-report.pdf)

[Markdown note](./Attachments-Test.md)

Inline code: `[Ignored](./attachments/report.txt)`

## Expected missing asset

[Missing PDF](./attachments/missing.pdf)

## Test modes

- **Off**: none of the links above are copied.
- **PDF and office documents**: `report.txt` and `table.csv` are copied.
- **All local attachments**: `report.txt`, `table.csv`, `diagram.drawio`, `dataset.json`, and `archive-summary.json` are copied.
- **Custom extensions** set to `txt, drawio`: only `report.txt` and `diagram.drawio` are copied.

When the selected mode includes `pdf`, the missing PDF should appear in both the notification count and developer-console report. Remote links, Markdown notes, and code snippets must remain unchanged.
