import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  FlaskConical,
  Info,
  LoaderCircle,
  PackageCheck,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Truck,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SelectField } from '@/components/ui/select-field'
import { QueryState, ErrorState } from '@/components/ui/async-state'
import { PageHeader } from '@/components/layout/PageHeader'
import { deliverySchema, parseOptionalNumber, type DeliveryForm } from '@/lib/delivery-schema'
import { categoryName, dateLabel, number, percent, stateNames } from '@/lib/format'
import { dss } from '@/services/dss'
import { ApiError } from '@/services/api'
import { useFilterOptions } from '@/hooks/use-dashboard'

const defaults: DeliveryForm = {
  purchase_date: '',
  estimated_date: '',
  seller_id: '',
  category: '',
  n_items: 1,
  total_price: 0,
  total_freight: 0,
  c_state: 'SP',
  s_state: 'SP',
}
const riskLabels = { low: 'Rủi ro thấp', medium: 'Rủi ro trung bình', high: 'Rủi ro cao' }
const riskAdvice = {
  low: 'Tiếp tục theo dõi đơn theo quy trình giao hàng thông thường.',
  medium: 'Chủ động xác nhận tiến độ với người bán và theo dõi mốc bàn giao.',
  high: 'Ưu tiên kiểm tra vận chuyển, xác nhận khả năng đáp ứng ngày hẹn và thông báo sớm cho khách hàng.',
}

export default function DeliveryRisk() {
  const form = useForm<DeliveryForm>({
    resolver: zodResolver(deliverySchema),
    defaultValues: defaults,
    mode: 'onTouched',
  })
  const examples = useQuery({
    queryKey: ['dss', 'examples'],
    queryFn: ({ signal }) => dss.examples(signal),
  })
  const metrics = useQuery({
    queryKey: ['dss', 'deliveryMetrics'],
    queryFn: ({ signal }) => dss.deliveryMetrics(signal),
  })
  const options = useFilterOptions()
  const [exampleIndex, setExampleIndex] = useState('')
  const [sampleOutcome, setSampleOutcome] = useState<boolean | null>(null)
  const [advanced, setAdvanced] = useState(false)
  const prediction = useMutation({
    mutationFn: dss.predict,
    onError: (error) => {
      if (error instanceof ApiError)
        error.issues.forEach((issue) => {
          const field = issue.loc.at(-1) as keyof DeliveryForm
          if (field in deliverySchema.shape) form.setError(field, { message: issue.msg })
        })
    },
  })
  function loadExample(value: string) {
    setExampleIndex(value)
    prediction.reset()
    if (!value) {
      form.reset(defaults)
      setSampleOutcome(null)
      return
    }
    const example = examples.data?.examples[Number(value) - 1]
    if (!example) return
    const { _actual_late, ...input } = example
    form.reset(input)
    setSampleOutcome(_actual_late)
  }
  function reset() {
    form.reset(defaults)
    prediction.reset()
    setExampleIndex('')
    setSampleOutcome(null)
  }
  function field(name: keyof DeliveryForm, label: string, type = 'text', placeholder?: string) {
    const error = form.formState.errors[name]
    return (
      <div className="form-field">
        <label htmlFor={name}>{label}</label>
        <Input
          id={name}
          type={type}
          placeholder={placeholder}
          aria-invalid={!!error}
          aria-describedby={error ? `${name}-error` : undefined}
          min={
            type === 'number'
              ? name === 'n_items'
                ? 1
                : 0
              : type === 'date'
                ? '1677-09-22'
                : undefined
          }
          max={type === 'date' ? '2262-04-11' : undefined}
          step={type === 'number' ? (name === 'n_items' ? '1' : 'any') : undefined}
          {...form.register(name, type === 'number' ? { setValueAs: parseOptionalNumber } : {})}
        />
        {error && (
          <p id={`${name}-error`} className="field-error">
            {error.message}
          </p>
        )}
      </div>
    )
  }
  function stateField(name: 'c_state' | 's_state', label: string) {
    return (
      <div className="form-field">
        <label htmlFor={name}>{label}</label>
        <SelectField id={name} {...form.register(name)}>
          {Object.entries(stateNames).map(([code, state]) => (
            <option key={code} value={code}>
              {code} · {state}
            </option>
          ))}
        </SelectField>
      </div>
    )
  }
  const result = prediction.data
  const importance = Object.entries(metrics.data?.feature_importance ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  return (
    <div className="page-stack">
      <PageHeader
        title="Dự đoán rủi ro giao hàng"
        description="Đánh giá khả năng giao trễ trước khi đơn hàng bắt đầu hành trình."
      />
      <div className="model-info-strip">
        <span className="soft-badge">
          <Sparkles size={13} />
          LightGBM Classifier
        </span>
        <span>Dự đoán theo từng đơn hàng</span>
        <span className="ml-auto text-xs">
          {metrics.data
            ? `${number(metrics.data.data_window?.orders)} đơn lịch sử`
            : 'Mô hình từ dữ liệu Olist'}
        </span>
      </div>
      <div className="risk-layout">
        <Card className="panel risk-form-panel">
          <div className="panel-heading">
            <div>
              <h2>Thông tin đơn hàng</h2>
              <p>Nhập thông tin hoặc bắt đầu từ một đơn hàng mẫu.</p>
            </div>
            <span className="panel-icon">
              <PackageCheck size={20} />
            </span>
          </div>
          <div className="sample-bar">
            <FlaskConical size={17} />
            <SelectField
              aria-label="Tải đơn hàng mẫu"
              value={exampleIndex}
              onChange={(e) => loadExample(e.target.value)}
              disabled={examples.isPending || prediction.isPending || !examples.data}
            >
              <option value="">
                {examples.isPending ? 'Đang tải đơn mẫu…' : 'Chọn đơn hàng mẫu'}
              </option>
              {examples.data?.examples.map((example, i) => (
                <option key={i} value={i + 1}>
                  Mẫu {i + 1} · {categoryName(example.category)} · {example.c_state}
                </option>
              ))}
            </SelectField>
            {examples.error && (
              <button
                className="text-xs text-destructive underline"
                onClick={() => void examples.refetch()}
              >
                Tải lại đơn mẫu
              </button>
            )}
          </div>
          <form
            noValidate
            onSubmit={form.handleSubmit(
              (input) => prediction.mutate(input),
              (errors) => {
                if (
                  [
                    'total_weight_g',
                    'total_volume_cm3',
                    'max_dim_cm',
                    'c_lat',
                    'c_lng',
                    's_lat',
                    's_lng',
                  ].some((key) => key in errors)
                )
                  setAdvanced(true)
              },
            )}
            onChange={() => {
              prediction.reset()
              setSampleOutcome(null)
              setExampleIndex('')
            }}
          >
            <fieldset disabled={prediction.isPending}>
              <div className="form-section-title">Đơn hàng & thời gian</div>
              <div className="form-grid">
                {field('purchase_date', 'Ngày mua *', 'date')}
                {field('estimated_date', 'Ngày hẹn giao *', 'date')}
                {field('seller_id', 'Mã người bán *', 'text', 'Nhập seller_id')}
                <div className="form-field">
                  <label htmlFor="category">Ngành hàng *</label>
                  <Input
                    id="category"
                    list="delivery-categories"
                    placeholder="Ví dụ: health_beauty"
                    aria-invalid={!!form.formState.errors.category}
                    aria-describedby="category-error"
                    {...form.register('category')}
                  />
                  <datalist id="delivery-categories">
                    {options.data?.categories.map((value) => (
                      <option key={value} value={value}>
                        {categoryName(value)}
                      </option>
                    ))}
                  </datalist>
                  {form.formState.errors.category && (
                    <p id="category-error" className="field-error">
                      {form.formState.errors.category.message}
                    </p>
                  )}
                </div>
              </div>
              <div className="form-section-title">Giá trị & vận chuyển</div>
              <div className="form-grid three">
                {field('n_items', 'Số lượng sản phẩm *', 'number')}
                {field('total_price', 'Giá sản phẩm (R$) *', 'number')}
                {field('total_freight', 'Phí vận chuyển (R$) *', 'number')}
              </div>
              <div className="form-grid mt-4">
                {stateField('s_state', 'Bang người bán *')}
                {stateField('c_state', 'Bang khách hàng *')}
              </div>
              <button
                type="button"
                className="advanced-toggle"
                aria-expanded={advanced}
                onClick={() => setAdvanced(!advanced)}
              >
                <span>
                  Thông tin bổ sung <span className="text-muted-foreground">· Tùy chọn</span>
                </span>
                <ChevronDown size={16} className={advanced ? 'rotate-180' : ''} />
              </button>
              {advanced && (
                <div className="advanced-fields">
                  <div className="form-grid three">
                    {field('total_weight_g', 'Khối lượng (g)', 'number')}
                    {field('total_volume_cm3', 'Thể tích (cm³)', 'number')}
                    {field('max_dim_cm', 'Cạnh dài nhất (cm)', 'number')}
                  </div>
                  <div className="form-grid mt-4">
                    {(['s_lat', 's_lng', 'c_lat', 'c_lng'] as const).map((name, i) => (
                      <div className="form-field" key={name}>
                        <label htmlFor={name}>
                          {
                            [
                              'Vĩ độ người bán',
                              'Kinh độ người bán',
                              'Vĩ độ khách hàng',
                              'Kinh độ khách hàng',
                            ][i]
                          }
                        </label>
                        <Input
                          id={name}
                          type="number"
                          step="any"
                          min={name.endsWith('lat') ? -90 : -180}
                          max={name.endsWith('lat') ? 90 : 180}
                          aria-invalid={!!form.formState.errors[name]}
                          {...form.register(name, { setValueAs: parseOptionalNumber })}
                        />
                        {form.formState.errors[name] && (
                          <p className="field-error">{form.formState.errors[name]?.message}</p>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Để trống nếu chưa biết. Tọa độ giúp model ước lượng khoảng cách vận chuyển.
                  </p>
                </div>
              )}
              <div className="form-actions">
                <Button variant="outline" type="button" onClick={reset}>
                  <RotateCcw />
                  Đặt lại
                </Button>
                <Button type="submit" size="lg">
                  {prediction.isPending ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
                  {prediction.isPending ? 'Đang phân tích…' : 'Dự đoán rủi ro'}
                  <ArrowRight />
                </Button>
              </div>
            </fieldset>
          </form>
        </Card>
        <div className="risk-side">
          <Card className={`panel prediction-panel ${result ? `risk-${result.risk_tier}` : ''}`}>
            <div className="panel-heading">
              <h2>Kết quả dự đoán</h2>
              <ShieldCheck size={19} className="text-primary" />
            </div>
            <div aria-live="polite">
              {prediction.isPending ? (
                <div className="prediction-empty">
                  <LoaderCircle className="size-10 animate-spin text-primary" />
                  <strong>Đang phân tích đơn hàng</strong>
                  <p>Model đang đánh giá các yếu tố giao hàng.</p>
                </div>
              ) : prediction.error ? (
                <ErrorState error={prediction.error} />
              ) : result ? (
                <>
                  <div className="risk-result">
                    <span className={`risk-tier ${result.risk_tier}`}>
                      {riskLabels[result.risk_tier]}
                    </span>
                    <strong>{percent(result.late_probability * 100, 2)}</strong>
                    <p>Xác suất giao sau ngày hẹn</p>
                  </div>
                  <div
                    className="probability-track"
                    role="meter"
                    aria-label="Xác suất giao trễ"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={result.late_probability * 100}
                  >
                    <span style={{ width: `${result.late_probability * 100}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-2">
                    <span>0%</span>
                    <span>100%</span>
                  </div>
                  <div className="risk-recommendation">
                    <CheckCircle2 size={17} />
                    <div>
                      <strong>Gợi ý hành động</strong>
                      <p>{riskAdvice[result.risk_tier]}</p>
                    </div>
                  </div>
                  <div className="thresholds">
                    <span>
                      Ngưỡng trung bình{' '}
                      <strong>≥ {percent(result.thresholds.medium * 100, 2)}</strong>
                    </span>
                    <span>
                      Ngưỡng cao <strong>≥ {percent(result.thresholds.high * 100, 2)}</strong>
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-3 leading-5">
                    Phân tầng theo ngưỡng của model. Rủi ro cao không đồng nghĩa xác suất trên 50%.
                  </p>
                  {sampleOutcome !== null && (
                    <p className="sample-outcome">
                      Kết quả lịch sử đơn mẫu:{' '}
                      <strong>{sampleOutcome ? 'Giao trễ' : 'Đúng hạn'}</strong>
                    </p>
                  )}
                </>
              ) : (
                <div className="prediction-empty">
                  <span className="prediction-illustration">
                    <Truck size={38} strokeWidth={1.4} />
                    <span>
                      <ShieldCheck size={19} />
                    </span>
                  </span>
                  <strong>Chưa có kết quả dự đoán</strong>
                  <p>Điền thông tin đơn hàng để xem xác suất giao trễ và gợi ý xử lý.</p>
                  <span className="soft-badge">18 đặc trưng · 3 mức rủi ro</span>
                </div>
              )}
            </div>
          </Card>
          <Card className="panel">
            <div className="panel-heading">
              <div>
                <h2>Yếu tố nổi bật</h2>
                <p>Feature importance toàn mô hình</p>
              </div>
            </div>
            <QueryState query={metrics}>
              {importance.map(([name, value]) => (
                <div className="importance-row" key={name}>
                  <div>
                    <span>{categoryName(name)}</span>
                    <strong>{percent(value)}</strong>
                  </div>
                  <span className="importance-track">
                    <i style={{ width: `${value}%` }} />
                  </span>
                </div>
              ))}
              <p className="text-[11px] leading-5 text-muted-foreground mt-3">
                Mức đóng góp tổng thể, không phải giải thích riêng cho đơn đang dự đoán.
              </p>
            </QueryState>
          </Card>
        </div>
      </div>
      <Card className="panel">
        <div className="panel-heading">
          <div>
            <h2>Đánh giá mô hình</h2>
            <p>Đánh giá trên tập thời gian tách biệt</p>
          </div>
          <span className="soft-badge">Model metrics</span>
        </div>
        <QueryState query={metrics}>
          <div className="model-metrics">
            {[
              ['Validation ROC-AUC', metrics.data?.validation?.roc_auc],
              ['Test ROC-AUC', metrics.data?.test?.roc_auc],
              ['Baseline ROC-AUC', metrics.data?.baseline?.roc_auc],
              ['Test PR-AUC', metrics.data?.test?.pr_auc],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <span>{label}</span>
                <strong>{number(value as number | undefined, 4)}</strong>
              </div>
            ))}
          </div>
          {metrics.data && (
            <div className="model-footnote">
              <Info size={16} />
              <p>
                {metrics.data.test?.roc_auc < metrics.data.baseline?.roc_auc
                  ? 'Model hiện chưa vượt baseline trên tập test. '
                  : ''}
                ROC-AUC và PR-AUC không phải tỷ lệ dự đoán đúng. Đơn mẫu dùng để minh họa form,
                không phải kiểm thử độc lập.{' '}
                {metrics.data.data_window && (
                  <>
                    Dữ liệu mua hàng: {dateLabel(metrics.data.data_window.purchase_from)} –{' '}
                    {dateLabel(metrics.data.data_window.purchase_to)}.
                  </>
                )}
              </p>
            </div>
          )}
        </QueryState>
      </Card>
    </div>
  )
}
