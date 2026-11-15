import { z } from 'zod'

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Chọn ngày hợp lệ.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`)
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value &&
      value >= '1677-09-22' &&
      value <= '2262-04-11'
    )
  }, 'Ngày phải tồn tại, từ 22/09/1677 đến 11/04/2262.')
const amount = z
  .number({ error: 'Nhập một số hợp lệ.' })
  .finite()
  .min(0, 'Giá trị phải lớn hơn hoặc bằng 0.')
const optionalAmount = amount.nullable().optional()
const coordinate = (max: number) =>
  z.number({ error: 'Nhập tọa độ hợp lệ.' }).finite().min(-max).max(max).nullable().optional()

export const deliverySchema = z
  .object({
    purchase_date: calendarDate,
    estimated_date: calendarDate,
    seller_id: z.string().trim().min(1, 'Vui lòng nhập mã người bán.'),
    category: z.string().trim().min(1, 'Vui lòng nhập ngành hàng.'),
    n_items: z
      .number({ error: 'Nhập số lượng sản phẩm.' })
      .int('Số lượng phải là số nguyên.')
      .positive('Số lượng phải lớn hơn 0.'),
    total_price: amount,
    total_freight: amount,
    c_state: z.string().regex(/^[A-Z]{2}$/, 'Chọn bang khách hàng.'),
    s_state: z.string().regex(/^[A-Z]{2}$/, 'Chọn bang người bán.'),
    total_weight_g: optionalAmount,
    total_volume_cm3: optionalAmount,
    max_dim_cm: optionalAmount,
    c_lat: coordinate(90),
    c_lng: coordinate(180),
    s_lat: coordinate(90),
    s_lng: coordinate(180),
  })
  .superRefine((value, context) => {
    const days = (Date.parse(value.estimated_date) - Date.parse(value.purchase_date)) / 86_400_000
    if (days < 0)
      context.addIssue({
        code: 'custom',
        path: ['estimated_date'],
        message: 'Ngày hẹn giao phải bằng hoặc sau ngày mua.',
      })
    if (days > 106751)
      context.addIssue({
        code: 'custom',
        path: ['estimated_date'],
        message: 'Khoảng thời gian giao hàng vượt giới hạn hỗ trợ.',
      })
  })
export type DeliveryForm = z.infer<typeof deliverySchema>
export const parseOptionalNumber = (value: string) => (value === '' ? undefined : Number(value))
