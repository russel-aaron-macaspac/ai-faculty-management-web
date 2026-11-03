import { cn } from '@/lib/utils';

export type ClearanceFormStatus = 'full-time' | 'part-time' | 'regular' | 'others';

export type ClearanceFormRow = {
  signature?: string;
  date?: string;
  remarks?: string;
};

export interface AcademicClearanceFormProps {
  academicYear?: string;
  semester?: string;
  name?: string;
  position?: string;
  department?: string;
  date?: string;
  status?: ClearanceFormStatus | null;
  othersText?: string;
  rows?: ClearanceFormRow[];
  logoSrc?: string;
  className?: string;
}

const OFFICES = [
  '1. DOMINICAN LEARNING RESOURCE CENTER',
  '2. PROPERTY MANAGEMENT OFFICE',
  '3. LABORATORY  (for those handling laboratory courses only)',
  '4. INFORMATION & COMMUNICATIONS TECHNOLOGY OFFICE',
  '5. COMMUNITY EXTENSION SERVICES OFFICE',
  '6. PROGRAM CHAIR/ASSISTANT PRINCIPAL',
  '7. DEAN/PRINCIPAL',
  "8. REGISTRAR'S OFFICE",
  '9. OFFICE OF THE VICE PRESIDENT FOR RESEARCH, EXTENSION & LINKAGES',
  '10. OFFICE OF THE VICE PRESIDENT FOR ACADEMIC AFFAIRS',
  '11. ACCOUNTING OFFICE',
  '12. TREASURY OFFICE',
  '13. HUMAN RESOURCES OFFICE',
];

function Box({ checked }: Readonly<{ checked: boolean }>) {
  return (
    <span className="mr-1 inline-flex h-[11px] w-[11px] items-center justify-center border border-black align-[-1px] text-[9px] leading-none">
      {checked ? 'x' : ''}
    </span>
  );
}

function Field({
  label,
  value,
  className,
  lineClassName,
}: Readonly<{ label: string; value?: string; className?: string; lineClassName?: string }>) {
  return (
    <div className={cn('flex items-end gap-1', className)}>
      <span className="font-bold">{label}</span>
      <span className={cn('min-h-[1.1em] flex-1 border-b border-black px-1 font-normal', lineClassName)}>{value}</span>
    </div>
  );
}

export function AcademicClearanceForm({
  academicYear = '',
  semester = '',
  name = '',
  position = '',
  department = '',
  date = '',
  status = null,
  othersText = '',
  rows = [],
  logoSrc,
  className,
}: Readonly<AcademicClearanceFormProps>) {
  return (
    <div
      className={cn(
        'mx-auto flex min-h-[1056px] w-full max-w-[816px] flex-col bg-white px-12 py-8 font-sans text-[13px] leading-snug text-black',
        className
      )}
    >
      <header>
        {logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoSrc} alt="St. Dominic College of Asia" className="block h-auto w-full" />
        ) : (
          <div className="flex items-center gap-4">
            <div className="w-[38%] shrink-0">
              <div className="font-serif text-slate-500">
                <div className="text-[28px] leading-none tracking-wide">
                  ST.<span className="text-[34px]">DOMINIC</span>
                </div>
                <div className="text-[24px] leading-none">COLLEGE OF ASIA</div>
                <div className="text-[9px] tracking-wide">REVOLUTIONIZINGEDUCATION</div>
              </div>
            </div>
            <div className="h-14 w-px bg-slate-400" />
            <div className="space-y-0.5 text-[9px] leading-tight text-slate-600">
              <p>St. Dominic Complex, E. Aguinaldo Highway, City of Bacoor, Cavite, Philippines 4102</p>
              <p>0917 625 8222 &nbsp;•&nbsp; 0922 850 9200 &nbsp;•&nbsp; (046) 417 7322 &nbsp;•&nbsp; (046) 417 8161</p>
              <p>www.stdominiccollege.edu.ph &nbsp; stdominiccollege &nbsp; @sdcapikemen</p>
            </div>
          </div>
        )}
      </header>

      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1 space-y-[2px]">
          <div className="h-[2px] bg-slate-700" />
          <div className="h-[2px] bg-slate-700" />
          <div className="h-[2px] bg-slate-700" />
        </div>
        <span className="text-[9px] text-slate-600">Human Resources Office</span>
        <div className="w-10 space-y-[2px]">
          <div className="h-[2px] bg-slate-700" />
          <div className="h-[2px] bg-slate-700" />
          <div className="h-[2px] bg-slate-700" />
        </div>
      </div>

      <h1 className="mt-3 text-center text-[17px] font-bold tracking-wide">ACADEMIC CLEARANCE FORM</h1>

      <div className="mt-1 flex justify-center gap-4 text-[14px]">
        <Field label="Academic Year:" value={academicYear} className="min-w-[190px]" lineClassName="min-w-[110px]" />
        <Field label="Semester/Summer:" value={semester} className="min-w-[190px]" lineClassName="min-w-[110px]" />
      </div>

      <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-[14px]">
        <Field label="NAME:" value={name} />
        <Field label="DATE:" value={date} className="w-[250px]" />
        <Field label="POSITION:" value={position} />
        <Field label="DEPARTMENT:" value={department} className="w-[250px]" />
      </div>

      <div className="mt-1 flex items-end gap-4 text-[14px]">
        <span className="font-bold">STATUS:</span>
        <span><Box checked={status === 'full-time'} />Full-Time</span>
        <span><Box checked={status === 'part-time'} />Part-Time</span>
        <span><Box checked={status === 'regular'} />Regular</span>
        <span className="flex items-end"><Box checked={status === 'others'} />Others:<span className="ml-1 inline-block min-w-[50px] border-b border-black">{othersText}</span></span>
      </div>

      <div className="mt-5 text-[14.5px] leading-snug">
        <p className="indent-12">This is to request your signature on the space provided below to signify that I am cleared from any accountabilities/deficiencies with the institution.</p>
        <p className="indent-12">Furthermore, I also recognized that the Accounting Office has the authority to deduct from my salary any payment/s for any liability on my part.</p>
      </div>

      <div className="mt-10 flex justify-end">
        <div className="w-[52%] border-t border-black pt-0.5 text-right text-[14px]">Employee&apos;s Signature Over Printed Name</div>
      </div>

      <table className="mt-3 w-full table-fixed border-collapse border border-slate-500 text-[13.5px]">
        <colgroup>
          <col style={{ width: '37%' }} />
          <col style={{ width: '27%' }} />
          <col style={{ width: '17%' }} />
          <col style={{ width: '19%' }} />
        </colgroup>
        <thead>
          <tr className="bg-slate-300 text-[15px] font-bold">
            <th className="border border-slate-500 px-2 py-2.5 text-center font-bold">OFFICE/DEPARTMENT</th>
            <th className="border border-slate-500 px-2 py-2.5 text-center font-bold">SIGNATURE</th>
            <th className="border border-slate-500 px-2 py-2.5 text-center font-bold">DATE</th>
            <th className="border border-slate-500 px-2 py-2.5 text-center font-bold">REMARKS</th>
          </tr>
        </thead>
        <tbody>
          {OFFICES.map((office, index) => (
            <tr key={office} className="h-[44px]">
              <td className="border border-slate-500 px-2 py-1 align-middle font-medium uppercase leading-tight">{office}</td>
              <td className="border border-slate-500 px-2 text-center">{rows[index]?.signature}</td>
              <td className="border border-slate-500 px-2 text-center">{rows[index]?.date}</td>
              <td className="border border-slate-500 px-2 text-center">{rows[index]?.remarks}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="border border-t-0 border-slate-500 px-2 pb-2 pt-1 text-[13.5px] leading-snug">
        <h2 className="font-bold">GUIDELINES:</h2>
        <ol className="list-decimal pl-7">
          <li>Only Faculty Members who have submitted their report of grades to the Dean/Principal and the Registrar&apos;s Office, and their employment requirements to the HRO will be cleared by the said offices.</li>
          <li>Academic employees must give one copy of the clearance to the HRO after completing the signatures of the clearing officers.</li>
          <li>Salaries will be withheld by the Accounting Office/Treasury Office if the accomplished academic clearance is not submitted.</li>
        </ol>
        <p className="text-center font-bold">Present this form upon claiming your salary.</p>
      </section>

      <footer className="mt-auto flex items-end justify-between pt-6 text-[13px]">
        <span>F-HRO-125 Rev. 7 (07-01-22)</span>
        <span className="text-slate-600">Page 1 of 1</span>
      </footer>
    </div>
  );
}
